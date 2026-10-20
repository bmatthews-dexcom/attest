/**
 * schema.ts — zod schemas for the CEO ledger + plan + autonomy + chief
 * task record. The TypeScript types in `@bpmforge/attest-ceo-mcp/types`
 * are the shared contract; this file is the agent-side runtime guard.
 *
 * Agent-side only — the MCP server does its own validation.
 */

import * as z from "zod/v4";

export const autonomyModeSchema = z.enum([
  "watch",
  "nudge",
  "draft-only",
  "draft-and-approve",
  "auto-dispatch",
]);

export const DEFAULT_AUTONOMY = "draft-and-approve" as const;

export const discussionSourceSchema = z.object({
  channel: z.enum([
    "cursor-chat",
    "paste",
    "slack",
    "linear",
    "github",
    "notes",
    "email",
    "other",
  ]),
  hint: z.string().optional(),
  url: z.string().nullable().optional(),
  referenceTime: z.string().nullable().optional(),
});

export const intentKindSchema = z.enum([
  "new-feature",
  "bug",
  "finding",
  "decision",
  "question",
  "chore",
]);

export const intentSchema = z.object({
  id: z.string(),
  summary: z.string(),
  kind: intentKindSchema,
  confidence: z.number().min(0).max(1),
  sourceEpisode: z.string(),
  proposedCommitmentText: z.string(),
  fingerprint: z.string(),
});

export const commitmentStateSchema = z.enum([
  "open",
  "in-flight",
  "shipped",
  "cancelled",
  "superseded",
]);

export const commitmentSchema = z.object({
  id: z.string(),
  text: z.string(),
  state: commitmentStateSchema,
  source: discussionSourceSchema,
  evidence: z.array(z.string()),
  dedupeFingerprint: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  dependencyIds: z.array(z.string()),
  chiefTaskIds: z.array(z.string()),
  priorityBand: z.enum(["p0", "p1", "p2", "p3"]).optional(),
});

export const initiativeSchema = z.object({
  id: z.string(),
  title: z.string(),
  rationale: z.string(),
  commitmentIds: z.array(z.string()),
  state: z.enum(["planned", "in-flight", "done", "cancelled"]),
  priorityBand: z.enum(["p0", "p1", "p2", "p3"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const planDispatchSchema = z.object({
  scope: z.string(),
  phaseHint: z.string().nullable().optional(),
  autonomy: z.enum(["interactive", "auto"]).optional(),
});

export const planStepSchema = z.object({
  id: z.string(),
  description: z.string(),
  dispatch: planDispatchSchema.nullable(),
  state: z.enum(["pending", "in-flight", "done", "failed", "cancelled"]),
  chiefTaskId: z.string().nullable().optional(),
});

export const planApprovalStateSchema = z.enum([
  "draft",
  "awaiting-approval",
  "approved",
  "denied",
  "in-flight",
  "complete",
  "cancelled",
]);

export const planSchema = z.object({
  id: z.string(),
  version: z.number(),
  title: z.string(),
  rationale: z.string(),
  commitmentIds: z.array(z.string()),
  steps: z.array(planStepSchema),
  approvalState: planApprovalStateSchema,
  estimatedChiefSessions: z.number(),
  riskNotes: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  dispatchMode: z.enum(["concurrent", "sequenced"]).optional(),
});

export const decisionSchema = z.object({
  id: z.string(),
  what: z.string(),
  when: z.string(),
  inputs: z.record(z.string(), z.unknown()),
  rationale: z.string(),
  policyEvaluation: z.string().nullable().optional(),
  confidence: z.number().nullable().optional(),
});

export const discussionDigestSchema = z.object({
  id: z.string(),
  source: discussionSourceSchema,
  ingestedAt: z.string(),
  textPreview: z.string(),
  intentIds: z.array(z.string()),
});

export const chiefTaskStatusSchema = z.object({
  taskId: z.string(),
  status: z.enum(["running", "halted", "done", "escalated"]),
  currentPhase: z.string().optional(),
  iteration: z.number().optional(),
  iterationCap: z.number().optional(),
  openFindings: z.number().optional(),
  lastSummary: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const chiefTaskCompletionSchema = z.object({
  taskId: z.string(),
  status: z.enum(["done", "escalated", "cancelled"]),
  endReason: z.string(),
  closedAt: z.string(),
  evidence: z.array(
    z.object({
      kind: z.enum(["file", "pr", "finding", "receipt"]),
      path: z.string().optional(),
      url: z.string().optional(),
      summary: z.string().optional(),
    }),
  ),
  openFindings: z.array(
    z.object({
      severity: z.enum(["soft", "gate", "halt"]),
      message: z.string(),
    }),
  ),
});

export const taskRefSchema = z.object({
  chiefTaskId: z.string(),
  planId: z.string(),
  stepId: z.string(),
  dispatchedAt: z.string(),
  lastSeenStatus: z
    .enum(["running", "halted", "done", "escalated"])
    .nullable()
    .optional(),
  completedAt: z.string().nullable().optional(),
});

export const ceoLedgerSchema = z.object({
  version: z.literal(1),
  roadmap: z.array(initiativeSchema),
  commitments: z.array(commitmentSchema),
  decisions: z.array(decisionSchema),
  discussions: z.array(discussionDigestSchema),
  tasks: z.array(taskRefSchema),
  plans: z.array(planSchema),
  autonomy: autonomyModeSchema,
  updatedAt: z.string(),
});

export type AutonomyMode = z.infer<typeof autonomyModeSchema>;
export type DiscussionSource = z.infer<typeof discussionSourceSchema>;
export type Intent = z.infer<typeof intentSchema>;
export type IntentKind = z.infer<typeof intentKindSchema>;
export type Commitment = z.infer<typeof commitmentSchema>;
export type CommitmentState = z.infer<typeof commitmentStateSchema>;
export type Initiative = z.infer<typeof initiativeSchema>;
export type Plan = z.infer<typeof planSchema>;
export type PlanStep = z.infer<typeof planStepSchema>;
export type PlanApprovalState = z.infer<typeof planApprovalStateSchema>;
export type Decision = z.infer<typeof decisionSchema>;
export type DiscussionDigest = z.infer<typeof discussionDigestSchema>;
export type ChiefTaskStatus = z.infer<typeof chiefTaskStatusSchema>;
export type ChiefTaskCompletion = z.infer<typeof chiefTaskCompletionSchema>;
export type TaskRef = z.infer<typeof taskRefSchema>;
export type CeoLedger = z.infer<typeof ceoLedgerSchema>;

export function emptyLedger(now: string = new Date().toISOString()): CeoLedger {
  return {
    version: 1,
    roadmap: [],
    commitments: [],
    decisions: [],
    discussions: [],
    tasks: [],
    plans: [],
    autonomy: DEFAULT_AUTONOMY,
    updatedAt: now,
  };
}
