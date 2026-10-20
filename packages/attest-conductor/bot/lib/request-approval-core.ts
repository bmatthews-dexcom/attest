/**
 * Pure logic for `request_approval`: transport selection, autonomy-mode
 * auto-approve, and the kv-polling resolution helper. Extracted from the
 * tool entry point so the tests can drive it without a BDK context.
 */

import {
  approvalIndexKey,
  approvalKey,
  isResolved,
  markTimedOut,
  newApprovalId,
  resolveApproval,
  type ApprovalGithubBinding,
  type ApprovalIndexEntry,
  type ApprovalRecord,
  type ApprovalResolution,
  type ApprovalTransport,
  DEFAULT_APPROVAL_TIMEOUT_MS,
  DEFAULT_APPROVAL_POLL_MS,
} from "./approvals.js";
import {
  isDestructiveCapability,
  needsHumanApproval,
  type AutonomyMode,
} from "./autonomy.js";
import {
  taskKey,
  type ConductorTask,
} from "./conductor-state.js";
import {
  renderApprovalCommentBody,
} from "./github-approval.js";

export type KvLike = {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
};

export type McpLike = {
  callTool(
    server: string,
    tool: string,
    input?: Record<string, unknown>,
  ): Promise<unknown>;
};

export type RequestApprovalCtx = {
  host: {
    kv: KvLike;
    mcp: McpLike;
  };
  /** Signals that the MCP client supports elicitation — opt-in flag the attest-mcp side also honors. */
  mcpSupportsElicitation?: boolean;
  /** GitHub poster — real deployments wire this to ctx.github.createComment(); tests pass a mock. */
  postGithubComment?: (input: {
    owner: string;
    repo: string;
    issueNumber: number;
    body: string;
  }) => Promise<{ commentId?: number }>;
};

export type TransportSelection = {
  transport: ApprovalTransport;
  reason: string;
};

/**
 * Pick the HITL transport under Shape C rules:
 *
 *   - Prefer MCP elicitation when the client supports it.
 *   - Prefer GitHub for `pr:*` / `publish:*` when autonomy mode is
 *     `approve-destructive` (humans trust the paper trail for those).
 *   - Else fall back to the first available transport (MCP, then GitHub).
 *   - If neither exists, return `none` so the caller fails closed.
 */
export function selectTransport(input: {
  autonomyMode: AutonomyMode;
  capability: string;
  mcpSupportsElicitation: boolean;
  hasGithubContext: boolean;
}): TransportSelection {
  const mcp = input.mcpSupportsElicitation;
  const gh = input.hasGithubContext;
  const paperTrail =
    input.autonomyMode === "approve-destructive" &&
    (input.capability.startsWith("pr:") || input.capability.startsWith("publish:"));

  if (paperTrail && gh) {
    return { transport: "github", reason: "approve-destructive + pr/publish prefers github paper trail" };
  }
  if (mcp && gh) {
    return { transport: "mcp", reason: "mcp elicitation preferred when both transports available" };
  }
  if (mcp) {
    return { transport: "mcp", reason: "only mcp elicitation attached" };
  }
  if (gh) {
    return { transport: "github", reason: "only github context attached" };
  }
  return { transport: "none", reason: "no hitl transport attached" };
}

export type RequestApprovalInput = {
  taskId: string;
  capability: string;
  prompt: string;
  destructiveOp?: string;
  target?: string;
  requestedByExpertId?: string;
  /** Override the task's autonomy mode for this one ask (rare — e.g. preview). */
  autonomyMode?: AutonomyMode;
  /** Approval timeout; default 24h. */
  timeoutMs?: number;
  /** How often to poll kv for a reply resolution. Default 5s; set small in tests. */
  pollMs?: number;
  /** Optional explicit approval id — otherwise generated. */
  approvalId?: string;
};

export type RequestApprovalResult = {
  approved: boolean;
  reason?: string;
  by?: string;
  approvalId: string;
  transport: ApprovalTransport;
  source: ApprovalResolution["source"];
  taskPresent: boolean;
};

/**
 * Short-circuit auto-approve: autonomy mode doesn't want a human on this
 * capability. Resolves without ever posting the ask.
 */
export function autoApproveIfPossible(
  mode: AutonomyMode,
  capability: string,
): ApprovalResolution | null {
  if (needsHumanApproval(mode, capability)) return null;
  return {
    approved: true,
    source: "autonomy-auto-approve",
    reason: `autonomy mode "${mode}" auto-approves capability "${capability}" (non-destructive).`,
  };
}

/** Transport-agnostic request_approval entry point used by the tool wrapper. */
export async function runRequestApproval(
  ctx: RequestApprovalCtx,
  input: RequestApprovalInput,
): Promise<RequestApprovalResult> {
  const { host } = ctx;
  const task = (await host.kv.get(taskKey(input.taskId))) as
    | ConductorTask
    | undefined;
  const taskPresent = Boolean(task);
  const autonomyMode = input.autonomyMode ?? task?.autonomyMode ?? "auto";
  const timeoutMs = input.timeoutMs ?? DEFAULT_APPROVAL_TIMEOUT_MS;
  const pollMs = input.pollMs ?? DEFAULT_APPROVAL_POLL_MS;
  const approvalId = input.approvalId ?? newApprovalId();
  const now = Date.now();

  const autoApprove = autoApproveIfPossible(autonomyMode, input.capability);
  if (autoApprove) {
    const record: ApprovalRecord = {
      approvalId,
      taskId: input.taskId,
      capability: input.capability,
      prompt: input.prompt,
      destructiveOp: input.destructiveOp,
      target: input.target,
      requestedByExpertId: input.requestedByExpertId,
      autonomyMode,
      transport: "none",
      status: "approved",
      requestedAtMs: now,
      deadlineMs: now,
      resolvedAtMs: now,
      resolution: autoApprove,
      github: task?.githubContext
        ? {
            owner: task.githubContext.owner,
            repo: task.githubContext.repo,
            issueNumber: task.githubContext.issueNumber,
          }
        : undefined,
    };
    await host.kv.put(approvalKey(approvalId), record);
    return {
      approved: true,
      reason: autoApprove.reason,
      approvalId,
      transport: "none",
      source: "autonomy-auto-approve",
      taskPresent,
    };
  }

  const transportPick = selectTransport({
    autonomyMode,
    capability: input.capability,
    mcpSupportsElicitation: Boolean(ctx.mcpSupportsElicitation),
    hasGithubContext: Boolean(task?.githubContext),
  });

  if (transportPick.transport === "none") {
    const record: ApprovalRecord = {
      approvalId,
      taskId: input.taskId,
      capability: input.capability,
      prompt: input.prompt,
      destructiveOp: input.destructiveOp,
      target: input.target,
      requestedByExpertId: input.requestedByExpertId,
      autonomyMode,
      transport: "none",
      status: "denied",
      requestedAtMs: now,
      deadlineMs: now,
      resolvedAtMs: now,
      resolution: {
        approved: false,
        source: "no_transport",
        reason: "no_hitl_transport",
      },
    };
    await host.kv.put(approvalKey(approvalId), record);
    return {
      approved: false,
      reason: "no_hitl_transport",
      approvalId,
      transport: "none",
      source: "no_transport",
      taskPresent,
    };
  }

  const github: ApprovalGithubBinding | undefined = task?.githubContext
    ? {
        owner: task.githubContext.owner,
        repo: task.githubContext.repo,
        issueNumber: task.githubContext.issueNumber,
      }
    : undefined;

  const pending: ApprovalRecord = {
    approvalId,
    taskId: input.taskId,
    capability: input.capability,
    prompt: input.prompt,
    destructiveOp: input.destructiveOp,
    target: input.target,
    requestedByExpertId: input.requestedByExpertId,
    autonomyMode,
    transport: transportPick.transport,
    status: "pending",
    requestedAtMs: now,
    deadlineMs: now + timeoutMs,
    github,
  };
  await host.kv.put(approvalKey(approvalId), pending);

  if (transportPick.transport === "mcp") {
    try {
      const raw = await ctx.host.mcp.callTool("attest", "request_approval", {
        reason: input.prompt,
        destructive_op: input.destructiveOp,
        target: input.target,
        approvalId,
        taskId: input.taskId,
        capability: input.capability,
      });
      const resolution = parseMcpApprovalResult(raw);
      const resolved = resolveApproval(pending, resolution) ?? pending;
      await host.kv.put(approvalKey(approvalId), resolved);
      return {
        approved: resolution.approved,
        reason: resolution.reason,
        by: resolution.by,
        approvalId,
        transport: "mcp",
        source: resolution.source,
        taskPresent,
      };
    } catch (err) {
      // MCP elicitation failed — fail-closed per the Shape C design doc.
      const message = err instanceof Error ? err.message : String(err);
      const resolution: ApprovalResolution = {
        approved: false,
        source: "mcp",
        reason: `mcp elicitation call failed: ${message}`,
      };
      const resolved = resolveApproval(pending, resolution) ?? pending;
      await host.kv.put(approvalKey(approvalId), resolved);
      return {
        approved: false,
        reason: resolution.reason,
        approvalId,
        transport: "mcp",
        source: "mcp",
        taskPresent,
      };
    }
  }

  if (transportPick.transport === "github") {
    if (!github) {
      const resolution: ApprovalResolution = {
        approved: false,
        source: "no_transport",
        reason: "github transport selected but task has no github context",
      };
      const resolved = resolveApproval(pending, resolution) ?? pending;
      await host.kv.put(approvalKey(approvalId), resolved);
      return {
        approved: false,
        reason: resolution.reason,
        approvalId,
        transport: "github",
        source: "no_transport",
        taskPresent,
      };
    }

    // Post the approval comment (if a poster is wired), then start polling.
    let commentId: number | undefined;
    if (ctx.postGithubComment) {
      try {
        const timeoutHours = Math.max(1, Math.round(timeoutMs / 3_600_000));
        const commentBody = renderApprovalCommentBody({
          approvalId,
          taskId: input.taskId,
          capability: input.capability,
          prompt: input.prompt,
          destructiveOp: input.destructiveOp,
          target: input.target,
          requestedByExpertId: input.requestedByExpertId,
          timeoutHours,
          autonomyMode,
        });
        const posted = await ctx.postGithubComment({
          owner: github.owner,
          repo: github.repo,
          issueNumber: github.issueNumber,
          body: commentBody,
        });
        commentId = posted.commentId;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const resolution: ApprovalResolution = {
          approved: false,
          source: "no_transport",
          reason: `github comment post failed: ${message}`,
        };
        const resolved = resolveApproval(pending, resolution) ?? pending;
        await host.kv.put(approvalKey(approvalId), resolved);
        return {
          approved: false,
          reason: resolution.reason,
          approvalId,
          transport: "github",
          source: "no_transport",
          taskPresent,
        };
      }
    }

    const pendingWithComment: ApprovalRecord = commentId
      ? { ...pending, github: { ...github, commentId } }
      : pending;
    await host.kv.put(approvalKey(approvalId), pendingWithComment);
    await addToIssueIndex(host.kv, github, approvalId, now);

    const resolved = await pollUntilResolved(host.kv, approvalId, {
      deadlineMs: pendingWithComment.deadlineMs,
      pollMs,
    });
    // Clean the index entry regardless of outcome.
    await removeFromIssueIndex(host.kv, github, approvalId);
    return {
      approved: resolved.approved,
      reason: resolved.reason,
      by: resolved.by,
      approvalId,
      transport: "github",
      source: resolved.source,
      taskPresent,
    };
  }

  // Exhausted — shouldn't reach.
  return {
    approved: false,
    reason: "unknown_transport",
    approvalId,
    transport: "none",
    source: "no_transport",
    taskPresent,
  };
}

/**
 * Parse the MCP server's `request_approval` response (elicitation path).
 * Accepts the SDK-style `{ content: [{ text: "<json>" }] }` wrapper, a raw
 * `{ approved, reason, by }` object, or a boolean-coerced shape.
 */
export function parseMcpApprovalResult(raw: unknown): ApprovalResolution {
  const payload = unwrapIfSdk(raw);
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    const approved =
      obj.approved === true ||
      obj.approved === "approved" ||
      obj.decision === "approve" ||
      obj.decision === "allow";
    const reason =
      typeof obj.reason === "string"
        ? obj.reason
        : typeof obj.note === "string"
        ? obj.note
        : undefined;
    const by = typeof obj.by === "string" ? obj.by : undefined;
    return { approved, reason, by, source: "mcp" };
  }
  // Fail-closed on ambiguous payloads — see MCP spec recommendation
  // referenced in docs/attest-chief-architecture.md §Open Questions #3.
  return {
    approved: false,
    source: "mcp",
    reason: "mcp elicitation returned ambiguous payload; failing closed",
  };
}

function unwrapIfSdk(raw: unknown): unknown {
  if (raw && typeof raw === "object" && "content" in raw) {
    const content = (raw as { content?: unknown }).content;
    if (Array.isArray(content) && content.length > 0 && typeof content[0] === "object") {
      const first = content[0] as { text?: string };
      if (typeof first.text === "string") {
        try {
          return JSON.parse(first.text);
        } catch {
          return first.text;
        }
      }
    }
  }
  return raw;
}

async function addToIssueIndex(
  kv: KvLike,
  github: ApprovalGithubBinding,
  approvalId: string,
  nowMs: number,
): Promise<void> {
  const key = approvalIndexKey(github);
  const existing = (await kv.get(key)) as ApprovalIndexEntry[] | undefined;
  const next: ApprovalIndexEntry[] = Array.isArray(existing) ? [...existing] : [];
  next.push({ approvalId, requestedAtMs: nowMs });
  await kv.put(key, next);
}

async function removeFromIssueIndex(
  kv: KvLike,
  github: ApprovalGithubBinding,
  approvalId: string,
): Promise<void> {
  const key = approvalIndexKey(github);
  const existing = (await kv.get(key)) as ApprovalIndexEntry[] | undefined;
  if (!Array.isArray(existing)) return;
  const next = existing.filter((e) => e.approvalId !== approvalId);
  if (next.length === 0) {
    await kv.delete(key);
  } else {
    await kv.put(key, next);
  }
}

type PollOptions = {
  deadlineMs: number;
  pollMs: number;
  /** Overridable sleep for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Overridable clock for tests. */
  now?: () => number;
};

/**
 * Poll kv for the approval record's status until it is resolved or the
 * deadline passes. On timeout, atomically mark the record `status=timeout`
 * and return the timeout resolution.
 */
export async function pollUntilResolved(
  kv: KvLike,
  approvalId: string,
  opts: PollOptions,
): Promise<ApprovalResolution> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = opts.now ?? (() => Date.now());
  while (true) {
    const current = (await kv.get(approvalKey(approvalId))) as ApprovalRecord | undefined;
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
    if (now() >= opts.deadlineMs) {
      const timedOut = markTimedOut(current, now());
      await kv.put(approvalKey(approvalId), timedOut);
      return timedOut.resolution ?? {
        approved: false,
        source: "timeout",
        reason: "timeout",
      };
    }
    await sleep(opts.pollMs);
  }
}

/**
 * Resolve a pending approval by its id. Called from the github channel's
 * `/approve` / `/deny` reply handler. Returns the updated record so the
 * caller can echo an ack comment.
 */
export async function applyReplyResolution(
  kv: KvLike,
  approvalId: string,
  resolution: ApprovalResolution,
): Promise<ApprovalRecord | null> {
  const key = approvalKey(approvalId);
  const current = (await kv.get(key)) as ApprovalRecord | undefined;
  if (!current) return null;
  const resolved = resolveApproval(current, resolution);
  if (!resolved) return current; // already resolved
  await kv.put(key, resolved);
  return resolved;
}

/**
 * Lookup pending approvals for a (owner, repo, issueNumber) tuple, oldest
 * first. Used by the github channel when `/approve` arrives without an
 * explicit approval id — resolve the oldest pending.
 */
export async function listPendingApprovalsForIssue(
  kv: KvLike,
  github: ApprovalGithubBinding,
): Promise<ApprovalRecord[]> {
  const key = approvalIndexKey(github);
  const index = (await kv.get(key)) as ApprovalIndexEntry[] | undefined;
  if (!Array.isArray(index) || index.length === 0) return [];
  const records: ApprovalRecord[] = [];
  for (const entry of [...index].sort((a, b) => a.requestedAtMs - b.requestedAtMs)) {
    const rec = (await kv.get(approvalKey(entry.approvalId))) as ApprovalRecord | undefined;
    if (rec && !isResolved(rec)) {
      records.push(rec);
    }
  }
  return records;
}
