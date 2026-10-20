/**
 * Live expert record — the artifact Director's §4.5 produces on approval.
 *
 * See `docs/attest-director-architecture.md` §11 for the ledger shape.
 */
import { z } from "zod";
import { CapabilityMapSchema } from "./capabilities.js";
import { FormFactorSchema } from "./draft.js";

export const ExpertScopeSchema = z.enum(["private", "shared"]);
export type ExpertScope = z.infer<typeof ExpertScopeSchema>;

export const ExpertLifecycleStateSchema = z.enum([
  "drafted",
  "eval-passing",
  "awaiting-approval",
  "deployed",
  "retired",
  "demoted",
]);
export type ExpertLifecycleState = z.infer<typeof ExpertLifecycleStateSchema>;

export const DeployLogEntrySchema = z.object({
  tsMs: z.number().int().nonnegative(),
  phase: z.enum([
    "register-manifest",
    "hot-register-mcp",
    "write-skill",
    "cursor-deploy",
    "notify-ceo",
    "rollback",
  ]),
  ok: z.boolean(),
  summary: z.string().min(1),
});
export type DeployLogEntry = z.infer<typeof DeployLogEntrySchema>;

export const TelemetrySnapshotSchema = z.object({
  tsMs: z.number().int().nonnegative(),
  invocations: z.number().int().nonnegative().default(0),
  evalPassRate: z.number().min(0).max(1).default(1),
  editDistanceP50: z.number().min(0).max(1).default(0),
  explicitRatings: z
    .object({ good: z.number().int().nonnegative(), bad: z.number().int().nonnegative() })
    .default({ good: 0, bad: 0 }),
});
export type TelemetrySnapshot = z.infer<typeof TelemetrySnapshotSchema>;

export const ExpertRecordSchema = z.object({
  expertId: z.string().min(1),
  briefId: z.string().min(1),
  scope: ExpertScopeSchema.default("private"),
  state: ExpertLifecycleStateSchema.default("drafted"),
  formFactor: FormFactorSchema,
  capabilities: CapabilityMapSchema,
  evalPassRate: z.number().min(0).max(1),
  deployLog: z.array(DeployLogEntrySchema).default([]),
  telemetry: z.array(TelemetrySnapshotSchema).default([]),
  createdAt: z.string().min(1),
  deployedAt: z.string().optional(),
  retiredAt: z.string().optional(),
  demotedAt: z.string().optional(),
});
export type ExpertRecord = z.infer<typeof ExpertRecordSchema>;

/**
 * The public resource the CEO polls — `attest-director://briefs/<id>/completion.json`.
 */
export const CompletionResourceSchema = z.object({
  role_brief_id: z.string().min(1),
  expert_id: z.string().min(1),
  form_factor: FormFactorSchema,
  scope: ExpertScopeSchema,
  eval_pass_rate: z.number().min(0).max(1),
  integrations_installed: z.array(z.string()).default([]),
  approved_by: z.string().optional(),
  approved_at: z.string().optional(),
  deployed_at: z.string().optional(),
  ceo_task_notified: z.string().optional(),
});
export type CompletionResource = z.infer<typeof CompletionResourceSchema>;

/**
 * The expert summary resource — `attest-director://experts/<id>/summary.json`.
 */
export const ExpertSummaryResourceSchema = ExpertRecordSchema.pick({
  expertId: true,
  briefId: true,
  scope: true,
  state: true,
  formFactor: true,
  capabilities: true,
  evalPassRate: true,
  deployedAt: true,
});
export type ExpertSummaryResource = z.infer<typeof ExpertSummaryResourceSchema>;
