import {
  defaultGitHubAuth,
  githubChannel,
} from "@cursor/bdk/channels/github";
import { parseAutopilotCommand } from "../lib/autopilot-parse.js";
import {
  extractApprovalId,
  parseApprovalReply,
} from "../lib/github-approval.js";
import {
  applyReplyResolution,
  listPendingApprovalsForIssue,
} from "../lib/request-approval-core.js";
import { approvalKey } from "../lib/approvals.js";

/**
 * GitHub channel — Shape C.
 *
 * Three distinct comment surfaces:
 *
 *   1. `/autopilot <goal> [autonomy: approve-each]` — kicks off a new
 *      Ralph loop with the originating PR/issue stored on the task so
 *      `request_approval` can post approval requests back on the same
 *      thread.
 *   2. `/approve [<approvalId>] [<note>…]` — resolve a pending approval.
 *      Scoped to the current issue; without an explicit id, resolves the
 *      oldest pending approval on this issue. Explicit id wins when the
 *      user wants to disambiguate across many open asks.
 *   3. `/deny` — same shape, denies instead.
 *
 * Comment-approve replies are host-task shape (`{ task }`): they mutate
 * kv (resolving the pending approval record) without starting a model
 * turn — the Ralph loop's own `request_approval` poll picks up the
 * resolution within `pollMs` and resumes.
 *
 * `/autopilot …` still returns `{ auth }` so the orchestrator kicks off
 * a model turn that calls `run_autopilot_task`. A follow-up PR will flip
 * this to the task-shaped run (see README).
 *
 * Credentials follow the BDK v2 pattern — named deployment secrets only.
 */
export default githubChannel({
  botName: "attest-conductor",
  continuation: "github.none/v2",
  credentials: {
    webhookSecret: { secretName: "GITHUB_WEBHOOK_SECRET" },
    appId: { secretName: "GITHUB_APP_ID" },
    privateKey: { secretName: "GITHUB_APP_PRIVATE_KEY" },
  },
  onComment: (ctx, comment) => {
    const body = comment.body?.trim() ?? "";

    // Priority 1: approval reply. We want `/approve` and `/deny` to
    // short-circuit without starting a model turn, so match them before
    // the autopilot slash.
    const reply = parseApprovalReply(body);
    if (reply) {
      return {
        task: async () => {
          const result = await resolveApprovalFromComment(ctx, comment, reply, body);
          // Log for operator visibility; the actual promise resolution for
          // the waiting Ralph `request_approval` call happens via kv.
          const line = `[github-approval] ${result.ok ? "ok" : "fail"} ${result.reason}${
            result.approvalId ? " approvalId=" + result.approvalId : ""
          }`;
          // eslint-disable-next-line no-console -- audit trail
          console.log(line);
        },
      };
    }

    // Priority 2: autopilot dispatch.
    const parsed = parseAutopilotCommand(body);
    if (parsed) {
      return { auth: defaultGitHubAuth(ctx) };
    }
    return null;
  },
  onIssue: (ctx, issue) => {
    if (issue.action !== "opened") {
      return null;
    }
    const body = `${issue.title ?? ""}\n${issue.body ?? ""}`.trim();
    const parsed = parseAutopilotCommand(body);
    if (!parsed) {
      return null;
    }
    return { auth: defaultGitHubAuth(ctx) };
  },
});

/**
 * Shape of the github comment payload bdk hands to onComment. We only
 * read a few fields — kept narrow to avoid coupling to the BDK event
 * contract shape beyond what we rely on.
 */
type GhCommentShape = {
  body?: string | null;
  id?: number;
  html_url?: string;
  user?: { login?: string };
  repository?: { owner?: { login?: string }; name?: string; full_name?: string };
  issue?: { number?: number };
  pull_request?: { number?: number };
};

type GhCtxShape = {
  host?: {
    kv?: {
      get(key: string): Promise<unknown>;
      put(key: string, value: unknown): Promise<void>;
      delete(key: string): Promise<void>;
    };
  };
  github?: {
    createComment?: (input: {
      owner: string;
      repo: string;
      issueNumber: number;
      body: string;
    }) => Promise<{ id?: number } | undefined>;
  };
};

async function resolveApprovalFromComment(
  ctxUnknown: unknown,
  comment: unknown,
  reply: ReturnType<typeof parseApprovalReply>,
  body: string,
): Promise<{ ok: boolean; reason: string; approvalId?: string }> {
  if (!reply) return { ok: false, reason: "no-reply-parse" };
  const ctx = ctxUnknown as GhCtxShape;
  const c = comment as GhCommentShape;
  const kv = ctx.host?.kv;
  if (!kv) return { ok: false, reason: "no-kv" };

  const github = extractGithubBindingFromComment(c);

  // Resolve approval target: explicit id → marker extracted from the
  // comment chain → oldest pending for this issue.
  let approvalId = reply.approvalId;
  if (!approvalId) {
    const marker = extractApprovalId(body);
    if (marker.approvalId) approvalId = marker.approvalId;
  }
  if (!approvalId && github) {
    const pending = await listPendingApprovalsForIssue(kv, github);
    if (pending.length > 0) {
      approvalId = pending[0].approvalId;
    }
  }
  if (!approvalId) {
    return { ok: false, reason: "no-pending-approval-found" };
  }

  const record = await kv.get(approvalKey(approvalId));
  if (!record) return { ok: false, reason: "approval-not-in-kv", approvalId };

  const resolved = await applyReplyResolution(kv, approvalId, {
    approved: reply.verb === "approve",
    source: "github",
    by: c.user?.login,
    reason: reply.note ?? (reply.verb === "approve" ? "approved via github" : "denied via github"),
  });
  if (!resolved) return { ok: false, reason: "approval-already-resolved", approvalId };

  return { ok: true, reason: `${reply.verb}d`, approvalId };
}

function extractGithubBindingFromComment(c: GhCommentShape):
  | { owner: string; repo: string; issueNumber: number }
  | undefined {
  const owner =
    c.repository?.owner?.login ??
    (c.repository?.full_name ? c.repository.full_name.split("/")[0] : undefined);
  const repo =
    c.repository?.name ??
    (c.repository?.full_name ? c.repository.full_name.split("/")[1] : undefined);
  const issueNumber = c.issue?.number ?? c.pull_request?.number;
  if (!owner || !repo || !issueNumber) return undefined;
  return { owner, repo, issueNumber };
}
