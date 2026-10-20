/**
 * Approval ledger — Director's HITL request/response state.
 *
 * Mirrors `packages/attest-conductor/bot/lib/approvals.ts` so chief, CEO,
 * and Director all speak one approval wire format. See
 * `docs/attest-director-architecture.md` §6.2 (ask-each inventory) and
 * `docs/attest-chief-architecture.md` §HITL for the shared discipline.
 */
import { z } from "zod";

export const ApprovalTransportSchema = z.enum(["mcp", "github", "none"]);
export type ApprovalTransport = z.infer<typeof ApprovalTransportSchema>;

export const ApprovalStatusSchema = z.enum([
  "pending",
  "approved",
  "denied",
  "timeout",
]);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

export const ApprovalResolutionSchema = z.object({
  approved: z.boolean(),
  reason: z.string().optional(),
  by: z.string().optional(),
  source: z.enum([
    "mcp",
    "github",
    "timeout",
    "no_transport",
    "autonomy-auto-approve",
    "forbidden-by-fence",
  ]),
});
export type ApprovalResolution = z.infer<typeof ApprovalResolutionSchema>;

export const ApprovalGithubBindingSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  issueNumber: z.number().int().positive(),
  commentId: z.number().int().positive().optional(),
});
export type ApprovalGithubBinding = z.infer<typeof ApprovalGithubBindingSchema>;

export const ApprovalRecordSchema = z.object({
  approvalId: z.string().min(1),
  taskId: z.string().min(1),
  capability: z.string().min(1),
  prompt: z.string().min(1),
  destructiveOp: z.string().optional(),
  target: z.string().optional(),
  requestedByExpertId: z.string().optional(),
  transport: ApprovalTransportSchema,
  status: ApprovalStatusSchema,
  requestedAtMs: z.number().int().nonnegative(),
  deadlineMs: z.number().int().nonnegative(),
  resolvedAtMs: z.number().int().nonnegative().optional(),
  resolution: ApprovalResolutionSchema.optional(),
  github: ApprovalGithubBindingSchema.optional(),
});
export type ApprovalRecord = z.infer<typeof ApprovalRecordSchema>;

/** 24h approval timeout — matches the Shape C design-doc value. */
export const DEFAULT_APPROVAL_TIMEOUT_MS = 24 * 60 * 60 * 1_000;
export const DEFAULT_APPROVAL_POLL_MS = 5_000;

export function newApprovalId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `approval_${Date.now().toString(36)}_${rand}`;
}

export function isResolved(record: ApprovalRecord): boolean {
  return record.status !== "pending";
}

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
