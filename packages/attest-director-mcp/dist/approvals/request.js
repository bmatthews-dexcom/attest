import {
  DEFAULT_APPROVAL_POLL_MS,
  DEFAULT_APPROVAL_TIMEOUT_MS,
  isResolved,
  markTimedOut,
  newApprovalId,
  resolveApproval
} from "../schema/approval.js";
import { directorKv } from "../kv/namespace.js";
import { evaluatePolicy } from "../policy/cedar.js";
import { isDestructiveCapability } from "../policy/fences.js";
function selectTransport(input) {
  const mcp = input.mcpSupportsElicitation;
  const gh = input.hasGithubContext;
  const paperTrail = gh && (input.capability.startsWith("pr:") || input.capability.startsWith("publish:"));
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
async function runRequestApproval(env, input) {
  const now = env.now ?? (() => Date.now());
  const sleep = env.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const approvalId = input.approvalId ?? newApprovalId();
  const timeoutMs = input.timeoutMs ?? DEFAULT_APPROVAL_TIMEOUT_MS;
  const pollMs = input.pollMs ?? DEFAULT_APPROVAL_POLL_MS;
  const nowMs = now();
  const policy = evaluatePolicy({ capability: input.capability });
  if (policy.decision === "deny") {
    const record = {
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
        reason: `capability '${input.capability}' is in the forbid tier (${policy.reason})`
      }
    };
    await env.kv.put(directorKv.approval(approvalId), record);
    return {
      approved: false,
      reason: record.resolution.reason,
      approvalId,
      transport: "none",
      source: "forbidden-by-fence"
    };
  }
  if (!isDestructiveCapability(input.capability)) {
    const record = {
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
        reason: `capability '${input.capability}' is non-destructive; auto-approved under draft-and-approve mode`
      }
    };
    await env.kv.put(directorKv.approval(approvalId), record);
    return {
      approved: true,
      reason: record.resolution.reason,
      approvalId,
      transport: "none",
      source: "autonomy-auto-approve"
    };
  }
  const transportPick = selectTransport({
    capability: input.capability,
    mcpSupportsElicitation: Boolean(env.mcpElicit),
    hasGithubContext: Boolean(input.github),
    autonomyMode: input.autonomyMode
  });
  if (transportPick.transport === "none") {
    const record = {
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
        reason: "no_hitl_transport"
      }
    };
    await env.kv.put(directorKv.approval(approvalId), record);
    return {
      approved: false,
      reason: "no_hitl_transport",
      approvalId,
      transport: "none",
      source: "no_transport"
    };
  }
  const pending = {
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
    github: input.github
  };
  await env.kv.put(directorKv.approval(approvalId), pending);
  if (transportPick.transport === "mcp") {
    if (!env.mcpElicit) {
      return failRecord(env.kv, pending, {
        approved: false,
        source: "no_transport",
        reason: "mcp transport selected but no elicit fn"
      });
    }
    try {
      const resolution = await env.mcpElicit({
        reason: input.prompt,
        destructiveOp: input.destructiveOp,
        target: input.target,
        approvalId,
        taskId: input.taskId,
        capability: input.capability
      });
      await resolvePending(env.kv, approvalId, resolution);
      return {
        approved: resolution.approved,
        reason: resolution.reason,
        by: resolution.by,
        approvalId,
        transport: "mcp",
        source: resolution.source
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return failRecord(env.kv, pending, {
        approved: false,
        source: "mcp",
        reason: `mcp elicitation call failed: ${message}`
      });
    }
  }
  if (transportPick.transport === "github") {
    const gh = input.github;
    if (!gh) {
      return failRecord(env.kv, pending, {
        approved: false,
        source: "no_transport",
        reason: "github transport selected but no github binding"
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
          timeoutHours: Math.max(1, Math.round(timeoutMs / 36e5))
        });
        const posted = await env.postGithubComment({
          owner: gh.owner,
          repo: gh.repo,
          issueNumber: gh.issueNumber,
          body
        });
        if (posted.commentId) {
          const next = { ...pending, github: { ...gh, commentId: posted.commentId } };
          await env.kv.put(directorKv.approval(approvalId), next);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return failRecord(env.kv, pending, {
          approved: false,
          source: "no_transport",
          reason: `github comment post failed: ${message}`
        });
      }
    }
    const resolution = await pollUntilResolved(env.kv, approvalId, {
      deadlineMs: pending.deadlineMs,
      pollMs,
      now,
      sleep
    });
    return {
      approved: resolution.approved,
      reason: resolution.reason,
      by: resolution.by,
      approvalId,
      transport: "github",
      source: resolution.source
    };
  }
  return failRecord(env.kv, pending, {
    approved: false,
    source: "no_transport",
    reason: "unknown_transport"
  });
}
async function failRecord(kv, pending, resolution) {
  const resolved = resolveApproval(pending, resolution) ?? pending;
  await kv.put(directorKv.approval(pending.approvalId), resolved);
  return {
    approved: false,
    reason: resolution.reason,
    approvalId: pending.approvalId,
    transport: resolved.transport,
    source: resolution.source
  };
}
async function resolvePending(kv, approvalId, resolution) {
  const current = await kv.get(directorKv.approval(approvalId));
  if (!current) return;
  const next = resolveApproval(current, resolution);
  if (!next) return;
  await kv.put(directorKv.approval(approvalId), next);
}
async function pollUntilResolved(kv, approvalId, opts) {
  while (true) {
    const current = await kv.get(directorKv.approval(approvalId));
    if (!current) {
      return {
        approved: false,
        source: "github",
        reason: `approval ${approvalId} vanished from kv while polling`
      };
    }
    if (isResolved(current) && current.resolution) {
      return current.resolution;
    }
    if (opts.now() >= opts.deadlineMs) {
      const timedOut = markTimedOut(current, opts.now());
      await kv.put(directorKv.approval(approvalId), timedOut);
      return timedOut.resolution ?? {
        approved: false,
        source: "timeout",
        reason: "timeout"
      };
    }
    await opts.sleep(opts.pollMs);
  }
}
function renderApprovalCommentBody(input) {
  const lines = [];
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
const APPROVAL_MARKER_RE = /<!--\s*attest-director:approval\s+id="(?<id>[A-Za-z0-9_-]+)"(?:\s+task="(?<task>[A-Za-z0-9_-]+)")?\s*-->/i;
function extractApprovalId(commentBody) {
  if (!commentBody) return {};
  const match = APPROVAL_MARKER_RE.exec(commentBody);
  if (!match || !match.groups) return {};
  const result = {};
  if (match.groups.id) result.approvalId = match.groups.id;
  if (match.groups.task) result.taskId = match.groups.task;
  return result;
}
const REPLY_RE = /^\s*\/(?<verb>approve|deny)\b(?:\s+(?<id>approval_[A-Za-z0-9_-]+))?(?:\s+(?<note>.+))?\s*$/i;
function parseApprovalReply(body) {
  if (!body) return null;
  const firstLine = body.split(/\r?\n/).find((line) => line.trim().length > 0);
  if (!firstLine) return null;
  const match = REPLY_RE.exec(firstLine);
  if (!match || !match.groups) return null;
  const verbRaw = match.groups.verb;
  if (!verbRaw) return null;
  const verb = verbRaw.toLowerCase();
  const reply = { verb };
  if (match.groups.id) reply.approvalId = match.groups.id;
  if (match.groups.note && match.groups.note.trim()) reply.note = match.groups.note.trim();
  return reply;
}
export {
  APPROVAL_MARKER_RE,
  extractApprovalId,
  parseApprovalReply,
  pollUntilResolved,
  renderApprovalCommentBody,
  runRequestApproval,
  selectTransport
};
//# sourceMappingURL=request.js.map
