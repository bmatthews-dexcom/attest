/**
 * Approval ledger — Shape C HITL request/response state.
 *
 * `request_approval` is the chief's single entry point for HITL. It records
 * one pending approval per call in `ctx.host.kv`, then either:
 *   - resolves immediately (autonomy-mode auto-approve, or MCP elicitation
 *     responds synchronously via `requestApprovalViaElicitation`), or
 *   - posts a GitHub comment and polls for `/approve` or `/deny` (set by
 *     the github channel's reply handler), or
 *   - returns `no_hitl_transport` fail-closed when no transport is wired.
 *
 * Pending records live under `conductor:approval:<approvalId>` so the
 * github channel reply handler can look them up without the Ralph loop
 * having to pass approval ids back through the comment body.
 *
 * Pending records are additionally indexed per issue (`conductor:approval-
 * index:<owner>/<repo>#<issue>`) as an ordered list, so `/approve` /
 * `/deny` without an explicit id can resolve the oldest-pending approval
 * on that issue. Explicit id (`/approve <approvalId>`) always wins.
 */

import type { AutonomyMode } from "./autonomy.js";

export type ApprovalTransport = "mcp" | "github" | "none";
export type ApprovalStatus = "pending" | "approved" | "denied" | "timeout";

export type ApprovalGithubBinding = {
  owner: string;
  repo: string;
  issueNumber: number;
  /** The comment id the chief posted asking for approval, when known. */
  commentId?: number;
};

export type ApprovalResolution = {
  approved: boolean;
  reason?: string;
  by?: string;
  source: "mcp" | "github" | "timeout" | "no_transport" | "autonomy-auto-approve";
};

export type ApprovalRecord = {
  approvalId: string;
  taskId: string;
  capability: string;
  prompt: string;
  destructiveOp?: string;
  target?: string;
  requestedByExpertId?: string;
  autonomyMode: AutonomyMode;
  transport: ApprovalTransport;
  status: ApprovalStatus;
  requestedAtMs: number;
  deadlineMs: number;
  resolvedAtMs?: number;
  resolution?: ApprovalResolution;
  github?: ApprovalGithubBinding;
};

/** Default HITL timeout. 24h is the design-doc value. */
export const DEFAULT_APPROVAL_TIMEOUT_MS = 24 * 60 * 60 * 1_000;

/** Default polling interval while waiting for a human reply. */
export const DEFAULT_APPROVAL_POLL_MS = 5_000;

/** `kv` key for one approval record. */
export function approvalKey(approvalId: string): string {
  return `conductor:approval:${approvalId}`;
}

/** `kv` key for the per-issue pending approval index. */
export function approvalIndexKey(github: ApprovalGithubBinding): string {
  return `conductor:approval-index:${github.owner}/${github.repo}#${github.issueNumber}`;
}

export type ApprovalIndexEntry = {
  approvalId: string;
  requestedAtMs: number;
};

export function newApprovalId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `approval_${Date.now().toString(36)}_${rand}`;
}

export function isResolved(record: ApprovalRecord): boolean {
  return record.status !== "pending";
}

/**
 * Resolve a pending approval. Returns `null` when `record` was already
 * resolved — callers decide whether that's a conflict (second user
 * replying `/deny` after a `/approve`) or a no-op.
 */
export function resolveApproval(
  record: ApprovalRecord,
  resolution: ApprovalResolution,
  nowMs: number = Date.now(),
): ApprovalRecord | null {
  if (isResolved(record)) return null;
  return {
    ...record,
    status: resolution.approved ? "approved" : "denied",
    resolution,
    resolvedAtMs: nowMs,
  };
}

export function markTimedOut(
  record: ApprovalRecord,
  nowMs: number = Date.now(),
): ApprovalRecord {
  if (isResolved(record)) return record;
  return {
    ...record,
    status: "timeout",
    resolution: {
      approved: false,
      source: "timeout",
      reason: "timeout",
    },
    resolvedAtMs: nowMs,
  };
}
