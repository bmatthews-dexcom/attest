import { z } from "zod";
const ApprovalTransportSchema = z.enum(["mcp", "github", "none"]);
const ApprovalStatusSchema = z.enum([
  "pending",
  "approved",
  "denied",
  "timeout"
]);
const ApprovalResolutionSchema = z.object({
  approved: z.boolean(),
  reason: z.string().optional(),
  by: z.string().optional(),
  source: z.enum([
    "mcp",
    "github",
    "timeout",
    "no_transport",
    "autonomy-auto-approve",
    "forbidden-by-fence"
  ])
});
const ApprovalGithubBindingSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  issueNumber: z.number().int().positive(),
  commentId: z.number().int().positive().optional()
});
const ApprovalRecordSchema = z.object({
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
  github: ApprovalGithubBindingSchema.optional()
});
const DEFAULT_APPROVAL_TIMEOUT_MS = 24 * 60 * 60 * 1e3;
const DEFAULT_APPROVAL_POLL_MS = 5e3;
function newApprovalId() {
  const rand = Math.random().toString(36).slice(2, 10);
  return `approval_${Date.now().toString(36)}_${rand}`;
}
function isResolved(record) {
  return record.status !== "pending";
}
function resolveApproval(record, resolution, nowMs = Date.now()) {
  if (isResolved(record)) return null;
  return {
    ...record,
    status: resolution.approved ? "approved" : "denied",
    resolution,
    resolvedAtMs: nowMs
  };
}
function markTimedOut(record, nowMs = Date.now()) {
  if (isResolved(record)) return record;
  return {
    ...record,
    status: "timeout",
    resolution: {
      approved: false,
      source: "timeout",
      reason: "timeout"
    },
    resolvedAtMs: nowMs
  };
}
export {
  ApprovalGithubBindingSchema,
  ApprovalRecordSchema,
  ApprovalResolutionSchema,
  ApprovalStatusSchema,
  ApprovalTransportSchema,
  DEFAULT_APPROVAL_POLL_MS,
  DEFAULT_APPROVAL_TIMEOUT_MS,
  isResolved,
  markTimedOut,
  newApprovalId,
  resolveApproval
};
//# sourceMappingURL=approval.js.map
