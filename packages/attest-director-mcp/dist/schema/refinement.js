import { z } from "zod";
import { EvalReportSchema } from "./draft.js";
const RefinementTriggerSchema = z.enum([
  "eval-regression",
  "edit-distance-spike",
  "explicit-user-request",
  "director-judgment-pass"
]);
const RefinementStateSchema = z.enum([
  "drafted",
  "awaiting-approval",
  "approved",
  "rejected",
  "applied",
  "rolled-back"
]);
const RefinementProposalSchema = z.object({
  refId: z.string().min(1).regex(/^ref-[a-z0-9-]+$/i),
  expertId: z.string().min(1),
  trigger: RefinementTriggerSchema,
  triggerDetail: z.string().min(1),
  linesChanged: z.number().int().nonnegative().max(100, "refinement diff cap is 100 lines per agent-self-edit Promotion Gate"),
  personaDiff: z.string().min(1),
  beforeEval: EvalReportSchema,
  afterEval: EvalReportSchema,
  whyItHelps: z.string().min(1).describe("5-sentence rationale per \xA79.3 (Darwin Agents critic pattern)."),
  rollbackPlan: z.string().min(1),
  state: RefinementStateSchema.default("drafted"),
  createdAt: z.string().min(1),
  resolvedAt: z.string().optional(),
  resolvedBy: z.string().optional()
});
function newRefId(nowMs = Date.now(), rand) {
  const d = new Date(nowMs);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const r = rand ?? Math.random().toString(36).slice(2, 4);
  return `ref-${yyyy}${mm}${dd}-${r}`;
}
const REFINEMENT_TRIGGER_DEFAULTS = {
  evalPassRateFloor: 0.8,
  editDistanceWindowDays: 7,
  editDistanceSharePct: 0.25,
  editDistanceThresholdPct: 0.4
};
const POST_ROLL_MONITOR_WINDOW_MS = 24 * 60 * 60 * 1e3;
export {
  POST_ROLL_MONITOR_WINDOW_MS,
  REFINEMENT_TRIGGER_DEFAULTS,
  RefinementProposalSchema,
  RefinementStateSchema,
  RefinementTriggerSchema,
  newRefId
};
//# sourceMappingURL=refinement.js.map
