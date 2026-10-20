/**
 * `request_approval` — Director's HITL ask.
 *
 * Mirrors the attest-conductor `request_approval` tool verbatim in shape:
 * the policy engine, autonomy modulator, and audit log all key on the same
 * capability string, and both transports (MCP elicitation, GitHub
 * comment-approve) use identical wire formats. See
 * `docs/attest-director-architecture.md` §6.2 (ask-each inventory) and
 * `packages/attest-conductor/bot/lib/request-approval-core.ts` for the
 * sibling implementation.
 *
 * Fail-closed: when no transport is wired, returns `approved=false,
 * reason="no_hitl_transport"`.
 */
import {
  DEFAULT_APPROVAL_POLL_MS,
  DEFAULT_APPROVAL_TIMEOUT_MS,
  isResolved,
  markTimedOut,
  newApprovalId,
  resolveApproval,
  type ApprovalGithubBinding,
  type ApprovalRecord,
  type ApprovalResolution,
  type ApprovalTransport,
} from "../schema/approval.js";
import type { KvStore } from "../kv/store.js";
import { directorKv } from "../kv/namespace.js";
import { evaluatePolicy } from "../policy/cedar.js";
import { isDestructiveCapability } from "../policy/fences.js";
import type { AutonomyMode } from "../schema/autonomy.js";

export interface RequestApprovalInput {
  taskId: string;
  capability: string;
  prompt: string;
  destructiveOp?: string;
  target?: string;
  requestedByExpertId?: string;
  autonomyMode?: AutonomyMode;
  approvalId?: string;
  timeoutMs?: number;
  pollMs?: number;
  github?: ApprovalGithubBinding;
}

export interface RequestApprovalResult {
  approved: boolean;
  reason?: string;
  by?: string;
  approvalId: string;
  transport: ApprovalTransport;
  source: ApprovalResolution["source"];
}

export interface RequestApprovalEnv {
  kv: KvStore;
  /** Opt-in: when the MCP client supports elicitation. */
  mcpElicit?: (prompt: {
    reason: string;
    destructiveOp?: string;
    target?: string;
    approvalId: string;
    taskId: string;
    capability: string;
  }) => Promise<ApprovalResolution>;
  /** Opt-in: when the chief has a github channel attached. */
  postGithubComment?: (input: {
    owner: string;
    repo: string;
    issueNumber: number;
    body: string;
  }) => Promise<{ commentId?: number }>;
  /** Clock injection — tests pass a fake clock. */
  now?: () => number;
  /** Sleep injection — tests pass a fake sleep. */
  sleep?: (ms: number) => Promise<void>;
}

export interface TransportSelection {
  transport: ApprovalTransport;
  reason: string;
}

export function selectTransport(input: {
  capability: string;
  mcpSupportsElicitation: boolean;
  hasGithubContext: boolean;
  autonomyMode?: AutonomyMode;
}): TransportSelection {
  const mcp = input.mcpSupportsElicitation;
  const gh = input.hasGithubContext;

  // Paper-trail preference: pr:* and publish:* prefer GitHub when both
  // transports are available (matches conductor's `approve-destructive`
  // branch). Director's Phase 1 only runs `draft-and-approve` mode, so
  // paper-trail preference applies on any destructive op.
  const paperTrail =
    gh && (input.capability.startsWith("pr:") || input.capability.startsWith("publish:"));
  if (paperTrail) {
    return { transport: "github", reason: "pr/publish prefers github paper trail" };
  }
  if (mcp && gh) {
    return { transport: "mcp", reason: "mcp elicitation preferred when both transports available" };
  }
  if (mcp) return { transport: "mcp", reason: "only mcp elicitation attached" };
  if (gh) return { transport: "github", reason: "only github context attached" };
  return { transport: "none", reason: "no hitl transport attached" };
}

export async function runRequestApproval(
  env: RequestApprovalEnv,
  input: RequestApprovalInput,
): Promise<RequestApprovalResult> {
  const now = env.now ?? (() => Date.now());
  const sleep = env.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const approvalId = input.approvalId ?? newApprovalId();
  const timeoutMs = input.timeoutMs ?? DEFAULT_APPROVAL_TIMEOUT_MS;
  const pollMs = input.pollMs ?? DEFAULT_APPROVAL_POLL_MS;
  const nowMs = now();

  // Belt + braces: if this capability is already in the `never` tier,
  // short-circuit with a policy denial — never even ask.
  const policy = evaluatePolicy({ capability: input.capability });
  if (policy.decision === "deny") {
    const record: ApprovalRecord = {
      approvalId,
      taskId: input.taskId,
      capability: input.capability,
      prompt: input.prompt,
      destructiveOp: input.destructiveOp,
      target: input.target,
      requestedByExpertId: input.requestedByExpertId,
      transport: "none",
      status: "denied",
      requestedAtMs: nowMs,
      deadlineMs: nowMs,
      resolvedAtMs: nowMs,
      resolution: {
        approved: false,
        source: "forbidden-by-fence",
        reason: `capability '${input.capability}' is in the forbid tier (${policy.reason})`,
      },
    };
    await env.kv.put(directorKv.approval(approvalId), record);
    return {
      approved: false,
      reason: record.resolution!.reason,
      approvalId,
      transport: "none",
      source: "forbidden-by-fence",
    };
  }

  // Non-destructive capabilities: nothing to ask about. Record an
  // auto-approval and return.
  if (!isDestructiveCapability(input.capability)) {
    const record: ApprovalRecord = {
      approvalId,
      taskId: input.taskId,
      capability: input.capability,
      prompt: input.prompt,
      destructiveOp: input.destructiveOp,
      target: input.target,
      requestedByExpertId: input.requestedByExpertId,
      transport: "none",
      status: "approved",
      requestedAtMs: nowMs,
      deadlineMs: nowMs,
      resolvedAtMs: nowMs,
      resolution: {
        approved: true,
        source: "autonomy-auto-approve",
        reason: `capability '${input.capability}' is non-destructive; auto-approved under draft-and-approve mode`,
      },
    };
    await env.kv.put(directorKv.approval(approvalId), record);
    return {
      approved: true,
      reason: record.resolution!.reason,
      approvalId,
      transport: "none",
      source: "autonomy-auto-approve",
    };
  }

  const transportPick = selectTransport({
    capability: input.capability,
    mcpSupportsElicitation: Boolean(env.mcpElicit),
    hasGithubContext: Boolean(input.github),
    autonomyMode: input.autonomyMode,
  });

  // Fail-closed when no transport is wired for a destructive capability.
  if (transportPick.transport === "none") {
    const record: ApprovalRecord = {
      approvalId,
      taskId: input.taskId,
      capability: input.capability,
      prompt: input.prompt,
      destructiveOp: input.destructiveOp,
      target: input.target,
      requestedByExpertId: input.requestedByExpertId,
      transport: "none",
      status: "denied",
      requestedAtMs: nowMs,
      deadlineMs: nowMs,
      resolvedAtMs: nowMs,
      resolution: {
        approved: false,
        source: "no_transport",
        reason: "no_hitl_transport",
      },
    };
    await env.kv.put(directorKv.approval(approvalId), record);
    return {
      approved: false,
      reason: "no_hitl_transport",
      approvalId,
      transport: "none",
      source: "no_transport",
    };
  }

  const pending: ApprovalRecord = {
    approvalId,
    taskId: input.taskId,
    capability: input.capability,
    prompt: input.prompt,
    destructiveOp: input.destructiveOp,
    target: input.target,
    requestedByExpertId: input.requestedByExpertId,
    transport: transportPick.transport,
    status: "pending",
    requestedAtMs: nowMs,
    deadlineMs: nowMs + timeoutMs,
    github: input.github,
  };
  await env.kv.put(directorKv.approval(approvalId), pending);

  if (transportPick.transport === "mcp") {
    if (!env.mcpElicit) {
      // Shouldn't happen (selectTransport refuses to pick mcp without mcpElicit).
      return failRecord(env.kv, pending, {
        approved: false,
        source: "no_transport",
        reason: "mcp transport selected but no elicit fn",
      });
    }
    try {
      const resolution = await env.mcpElicit({
        reason: input.prompt,
        destructiveOp: input.destructiveOp,
        target: input.target,
        approvalId,
        taskId: input.taskId,
        capability: input.capability,
      });
      await resolvePending(env.kv, approvalId, resolution);
      return {
        approved: resolution.approved,
        reason: resolution.reason,
        by: resolution.by,
        approvalId,
        transport: "mcp",
        source: resolution.source,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return failRecord(env.kv, pending, {
        approved: false,
        source: "mcp",
        reason: `mcp elicitation call failed: ${message}`,
      });
    }
  }

  if (transportPick.transport === "github") {
    const gh = input.github;
    if (!gh) {
      return failRecord(env.kv, pending, {
        approved: false,
        source: "no_transport",
        reason: "github transport selected but no github binding",
      });
    }
    if (env.postGithubComment) {
      try {
        const body = renderApprovalCommentBody({
          approvalId,
          taskId: input.taskId,
          capability: input.capability,
          prompt: input.prompt,
          destructiveOp: input.destructiveOp,
          target: input.target,
          requestedByExpertId: input.requestedByExpertId,
          timeoutHours: Math.max(1, Math.round(timeoutMs / 3_600_000)),
        });
        const posted = await env.postGithubComment({
          owner: gh.owner,
          repo: gh.repo,
          issueNumber: gh.issueNumber,
          body,
        });
        if (posted.commentId) {
          const next: ApprovalRecord = { ...pending, github: { ...gh, commentId: posted.commentId } };
          await env.kv.put(directorKv.approval(approvalId), next);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return failRecord(env.kv, pending, {
          approved: false,
          source: "no_transport",
          reason: `github comment post failed: ${message}`,
        });
      }
    }
    const resolution = await pollUntilResolved(env.kv, approvalId, {
      deadlineMs: pending.deadlineMs,
      pollMs,
      now,
      sleep,
    });
    return {
      approved: resolution.approved,
      reason: resolution.reason,
      by: resolution.by,
      approvalId,
      transport: "github",
      source: resolution.source,
    };
  }

  return failRecord(env.kv, pending, {
    approved: false,
    source: "no_transport",
    reason: "unknown_transport",
  });
}

async function failRecord(
  kv: KvStore,
  pending: ApprovalRecord,
  resolution: ApprovalResolution,
): Promise<RequestApprovalResult> {
  const resolved = resolveApproval(pending, resolution) ?? pending;
  await kv.put(directorKv.approval(pending.approvalId), resolved);
  return {
    approved: false,
    reason: resolution.reason,
    approvalId: pending.approvalId,
    transport: resolved.transport,
    source: resolution.source,
  };
}

async function resolvePending(
  kv: KvStore,
  approvalId: string,
  resolution: ApprovalResolution,
): Promise<void> {
  const current = (await kv.get<ApprovalRecord>(directorKv.approval(approvalId))) as
    | ApprovalRecord
    | undefined;
  if (!current) return;
  const next = resolveApproval(current, resolution);
  if (!next) return;
  await kv.put(directorKv.approval(approvalId), next);
}

export interface PollOpts {
  deadlineMs: number;
  pollMs: number;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

export async function pollUntilResolved(
  kv: KvStore,
  approvalId: string,
  opts: PollOpts,
): Promise<ApprovalResolution> {
  while (true) {
    const current = (await kv.get<ApprovalRecord>(directorKv.approval(approvalId))) as
      | ApprovalRecord
      | undefined;
    if (!current) {
      return {
        approved: false,
        source: "github",
        reason: `approval ${approvalId} vanished from kv while polling`,
      };
    }
    if (isResolved(current) && current.resolution) {
      return current.resolution;
    }
    if (opts.now() >= opts.deadlineMs) {
      const timedOut = markTimedOut(current, opts.now());
      await kv.put(directorKv.approval(approvalId), timedOut);
      return (
        timedOut.resolution ?? {
          approved: false,
          source: "timeout",
          reason: "timeout",
        }
      );
    }
    await opts.sleep(opts.pollMs);
  }
}

export function renderApprovalCommentBody(input: {
  approvalId: string;
  taskId: string;
  capability: string;
  prompt: string;
  destructiveOp?: string;
  target?: string;
  requestedByExpertId?: string;
  timeoutHours?: number;
}): string {
  const lines: string[] = [];
  lines.push("> **attest-director needs approval**");
  lines.push(">");
  lines.push(`> capability: \`${input.capability}\``);
  lines.push(`> reason: ${input.prompt}`);
  if (input.destructiveOp) lines.push(`> op: \`${input.destructiveOp}\``);
  if (input.target) lines.push(`> target: \`${input.target}\``);
  if (input.requestedByExpertId) lines.push(`> requested-by-expert: \`${input.requestedByExpertId}\``);
  if (input.timeoutHours) lines.push(`> timeout: ${input.timeoutHours}h`);
  lines.push(">");
  lines.push("> Reply with `/approve` or `/deny` (optionally `/approve <approvalId>` to disambiguate).");
  lines.push(">");
  lines.push(`> <!-- attest-director:approval id="${input.approvalId}" task="${input.taskId}" -->`);
  return lines.join("\n");
}

export const APPROVAL_MARKER_RE =
  /<!--\s*attest-director:approval\s+id="(?<id>[A-Za-z0-9_-]+)"(?:\s+task="(?<task>[A-Za-z0-9_-]+)")?\s*-->/i;

export function extractApprovalId(commentBody: string | undefined | null): {
  approvalId?: string;
  taskId?: string;
} {
  if (!commentBody) return {};
  const match = APPROVAL_MARKER_RE.exec(commentBody);
  if (!match || !match.groups) return {};
  const result: { approvalId?: string; taskId?: string } = {};
  if (match.groups.id) result.approvalId = match.groups.id;
  if (match.groups.task) result.taskId = match.groups.task;
  return result;
}

const REPLY_RE = /^\s*\/(?<verb>approve|deny)\b(?:\s+(?<id>approval_[A-Za-z0-9_-]+))?(?:\s+(?<note>.+))?\s*$/i;

export interface ApprovalReply {
  verb: "approve" | "deny";
  approvalId?: string;
  note?: string;
}

export function parseApprovalReply(body: string | undefined | null): ApprovalReply | null {
  if (!body) return null;
  const firstLine = body.split(/\r?\n/).find((line) => line.trim().length > 0);
  if (!firstLine) return null;
  const match = REPLY_RE.exec(firstLine);
  if (!match || !match.groups) return null;
  const verbRaw = match.groups.verb;
  if (!verbRaw) return null;
  const verb = verbRaw.toLowerCase() as "approve" | "deny";
  const reply: ApprovalReply = { verb };
  if (match.groups.id) reply.approvalId = match.groups.id;
  if (match.groups.note && match.groups.note.trim()) reply.note = match.groups.note.trim();
  return reply;
}
