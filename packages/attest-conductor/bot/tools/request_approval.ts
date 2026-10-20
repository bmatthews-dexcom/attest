import { defineTool } from "@cursor/bdk/tools";
import * as z from "zod/v4";
import {
  taskKey,
  type ConductorTask,
  type IterationLog,
} from "../lib/conductor-state.js";
import {
  runRequestApproval,
  type RequestApprovalCtx,
  type RequestApprovalInput,
  type RequestApprovalResult,
} from "../lib/request-approval-core.js";
import { DEFAULT_APPROVAL_TIMEOUT_MS } from "../lib/approvals.js";

type ToolResult = RequestApprovalResult & {
  taskId: string;
  autonomyMode?: string;
};

export default defineTool({
  description:
    "Shape-C HITL request. Posts a human-approval ask on the best available transport (MCP elicitation preferred when attached, GitHub comment-approve otherwise; `pr:*` / `publish:*` under autonomy=approve-destructive prefer GitHub for the paper trail). Returns `{ approved, reason, by, approvalId, transport, source }`. **Fail-closed** when no transport is wired: `{ approved: false, reason: \"no_hitl_transport\" }`. Call this when `pre_dispatch_check` returned `requires-approval`, or ad-hoc when about to run a destructive op. On denial, escalate or route differently — never retry blindly.",
  effect: "write",
  inputSchema: z.object({
    taskId: z.string(),
    capability: z
      .string()
      .min(1)
      .describe("The capability needing approval (e.g. `write:src`, `pr:comment`, `publish:npm`, `shell:destructive`). Keep this stable — the policy engine, autonomy-mode matcher, and audit log all key on it."),
    prompt: z
      .string()
      .min(1)
      .describe("Short, human-readable justification shown to the approver."),
    destructiveOp: z
      .string()
      .optional()
      .describe("Specific destructive op this would run (e.g. a registry publish, `git push`, `gh pr merge`)."),
    target: z
      .string()
      .optional()
      .describe("Specific target (e.g. `owner/repo#123`, `src/auth.ts`)."),
    requestedByExpertId: z
      .string()
      .optional()
      .describe("Expert id that triggered the ask, when known."),
    timeoutMs: z
      .number()
      .int()
      .positive()
      .max(DEFAULT_APPROVAL_TIMEOUT_MS)
      .optional()
      .describe(`How long to wait before timing out (defaults to ${DEFAULT_APPROVAL_TIMEOUT_MS / 3_600_000}h).`),
  }),
  async execute(input, ctx): Promise<ToolResult> {
    const task = (await ctx.host.kv.get(taskKey(input.taskId))) as
      | ConductorTask
      | undefined;

    const kvAny = ctx.host.kv as unknown as {
      get(key: string): Promise<unknown>;
      put(key: string, value: unknown): Promise<void>;
      delete(key: string): Promise<void>;
    };
    const requestCtx: RequestApprovalCtx = {
      host: {
        kv: {
          get: (k: string) => kvAny.get(k),
          put: (k: string, v: unknown) => kvAny.put(k, v),
          delete: (k: string) => kvAny.delete(k),
        },
        mcp: {
          callTool: (server: string, tool: string, args?: Record<string, unknown>) =>
            ctx.host.mcp.callTool(server, tool, args),
        },
      },
      mcpSupportsElicitation: hasMcpElicitationSupport(ctx),
      postGithubComment: makeGithubPoster(ctx),
    };

    const callInput: RequestApprovalInput = {
      taskId: input.taskId,
      capability: input.capability,
      prompt: input.prompt,
      destructiveOp: input.destructiveOp,
      target: input.target,
      requestedByExpertId: input.requestedByExpertId,
      timeoutMs: input.timeoutMs,
    };

    const result = await runRequestApproval(requestCtx, callInput);

    // Log + stamp the task so Ralph sees the request in next-turn state.
    if (task) {
      const logEntry: IterationLog = {
        iteration: task.iteration,
        action: "request_approval",
        summary: `${result.transport} ${result.approved ? "approved" : "denied"} (${result.source}) — ${input.capability}${result.reason ? ": " + result.reason.slice(0, 160) : ""}`,
        tsMs: Date.now(),
      };
      const pendingApprovalIds = task.pendingApprovalIds.filter((id) => id !== result.approvalId);
      const next: ConductorTask = {
        ...task,
        iterationLog: [...task.iterationLog, logEntry],
        pendingApprovalIds,
      };
      await ctx.host.kv.put(taskKey(input.taskId), next);
    }

    return {
      ...result,
      taskId: input.taskId,
      autonomyMode: task?.autonomyMode,
    };
  },
});

/**
 * Opt-in detection: BDK ctx surfaces capability flags under `ctx.capabilities`
 * when attached. If attest-mcp advertises elicitation support that way, read
 * it; otherwise fall through to env var `ATTEST_MCP_SUPPORTS_ELICITATION=1`.
 */
function hasMcpElicitationSupport(ctx: unknown): boolean {
  const anyCtx = ctx as {
    capabilities?: { elicitation?: boolean };
    mcp?: { elicitation?: boolean };
  };
  if (anyCtx?.capabilities?.elicitation === true) return true;
  if (anyCtx?.mcp?.elicitation === true) return true;
  return process.env.ATTEST_MCP_SUPPORTS_ELICITATION === "1";
}

/**
 * Build a github comment poster from `ctx.github` when present. The BDK
 * github channel surfaces a `ctx.github` facade with `createComment`; we
 * reach for it opportunistically and return `undefined` when absent so
 * the request-approval core knows the post failed deterministically.
 */
function makeGithubPoster(ctx: unknown):
  | ((input: {
      owner: string;
      repo: string;
      issueNumber: number;
      body: string;
    }) => Promise<{ commentId?: number }>)
  | undefined {
  const anyCtx = ctx as {
    github?: {
      createComment?: (args: {
        owner: string;
        repo: string;
        issueNumber: number;
        body: string;
      }) => Promise<{ id?: number } | undefined>;
      issues?: {
        createComment?: (args: {
          owner: string;
          repo: string;
          issue_number: number;
          body: string;
        }) => Promise<{ data?: { id?: number } }>;
      };
    };
  };
  const direct = anyCtx?.github?.createComment;
  if (typeof direct === "function") {
    return async (input) => {
      const posted = await direct({
        owner: input.owner,
        repo: input.repo,
        issueNumber: input.issueNumber,
        body: input.body,
      });
      return { commentId: posted?.id };
    };
  }
  const octokitStyle = anyCtx?.github?.issues?.createComment;
  if (typeof octokitStyle === "function") {
    return async (input) => {
      const posted = await octokitStyle({
        owner: input.owner,
        repo: input.repo,
        issue_number: input.issueNumber,
        body: input.body,
      });
      return { commentId: posted?.data?.id };
    };
  }
  return undefined;
}
