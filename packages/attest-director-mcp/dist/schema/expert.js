import { z } from "zod";
import { CapabilityMapSchema } from "./capabilities.js";
import { FormFactorSchema } from "./draft.js";
const ExpertScopeSchema = z.enum(["private", "shared"]);
const ExpertLifecycleStateSchema = z.enum([
  "drafted",
  "eval-passing",
  "awaiting-approval",
  "deployed",
  "retired",
  "demoted"
]);
const DeployLogEntrySchema = z.object({
  tsMs: z.number().int().nonnegative(),
  phase: z.enum([
    "register-manifest",
    "hot-register-mcp",
    "write-skill",
    "cursor-deploy",
    "notify-ceo",
    "rollback"
  ]),
  ok: z.boolean(),
  summary: z.string().min(1)
});
const TelemetrySnapshotSchema = z.object({
  tsMs: z.number().int().nonnegative(),
  invocations: z.number().int().nonnegative().default(0),
  evalPassRate: z.number().min(0).max(1).default(1),
  editDistanceP50: z.number().min(0).max(1).default(0),
  explicitRatings: z.object({ good: z.number().int().nonnegative(), bad: z.number().int().nonnegative() }).default({ good: 0, bad: 0 })
});
const ExpertRecordSchema = z.object({
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
  demotedAt: z.string().optional()
});
const CompletionResourceSchema = z.object({
  role_brief_id: z.string().min(1),
  expert_id: z.string().min(1),
  form_factor: FormFactorSchema,
  scope: ExpertScopeSchema,
  eval_pass_rate: z.number().min(0).max(1),
  integrations_installed: z.array(z.string()).default([]),
  approved_by: z.string().optional(),
  approved_at: z.string().optional(),
  deployed_at: z.string().optional(),
  ceo_task_notified: z.string().optional()
});
const ExpertSummaryResourceSchema = ExpertRecordSchema.pick({
  expertId: true,
  briefId: true,
  scope: true,
  state: true,
  formFactor: true,
  capabilities: true,
  evalPassRate: true,
  deployedAt: true
});
export {
  CompletionResourceSchema,
  DeployLogEntrySchema,
  ExpertLifecycleStateSchema,
  ExpertRecordSchema,
  ExpertScopeSchema,
  ExpertSummaryResourceSchema,
  TelemetrySnapshotSchema
};
//# sourceMappingURL=expert.js.map
