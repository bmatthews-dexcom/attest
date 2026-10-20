import { z } from "zod";
import { CapabilityMapSchema } from "./capabilities.js";
const TypicalIOSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  example: z.string().min(1).optional()
});
const RequestedCapabilitiesSchema = CapabilityMapSchema;
const RequiredIntegrationSchema = z.object({
  kind: z.enum(["mcp-server", "library", "cli-tool", "service"]),
  candidates: z.array(z.string().min(1)).min(1),
  install_steps_tbd: z.boolean().default(true),
  notes: z.string().optional()
});
const GoldenSetEntrySchema = z.object({
  input: z.string().min(1),
  expected_rubric: z.string().min(1),
  notes: z.string().optional()
});
const RoleBriefRequestedBySchema = z.object({
  source: z.enum(["ceo", "bradford", "director-refinement"]),
  task_id: z.string().min(1).optional(),
  requested_by_user: z.string().optional()
});
const RoleBriefProximityCheckSchema = z.object({
  topMatches: z.array(
    z.object({
      expertId: z.string().min(1),
      score: z.number().min(0).max(1),
      rationale: z.string().min(1)
    })
  ).default([]),
  verdict: z.enum([
    "safely-new",
    "surface-near-match",
    "rename-and-dispatch",
    "rename-and-create",
    "create-separately",
    "refuse-rejected-earlier"
  ]).describe(
    "Proximity-check outcome; drives \xA74.7 close-match decision tree."
  ),
  rejectionFingerprint: z.string().optional()
});
const RoleBriefStateSchema = z.enum([
  "proposed",
  "research-ready",
  "draft-ready",
  "eval-passing",
  "eval-stuck",
  "awaiting-approval",
  "deployed",
  "rejected",
  "parked",
  "org-mission-rejected",
  "duplicate"
]);
const RoleBriefSchema = z.object({
  id: z.string().min(1).regex(/^rb-[a-z0-9-]+$/i, "role-brief id must start with 'rb-'"),
  version: z.string().default("1.0"),
  role: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/i, "role must be kebab-case id"),
  title: z.string().min(1),
  mission: z.string().min(1).describe("One-paragraph plain-English statement."),
  responsibilities: z.array(z.string().min(1)).min(3).max(7),
  typical_inputs: z.array(TypicalIOSchema).min(1),
  typical_outputs: z.array(TypicalIOSchema).min(1),
  example_task: z.string().min(1),
  domain_context: z.string().min(1).optional(),
  urgency: z.enum(["normal", "urgent", "scheduled"]).default("normal"),
  requested_by: RoleBriefRequestedBySchema,
  requested_capabilities: RequestedCapabilitiesSchema,
  form_factor_preference: z.enum(["auto", "skill", "in-process-handler", "sandbox-bdk-agent"]).default("auto"),
  required_integrations: z.array(RequiredIntegrationSchema).default([]),
  golden_set: z.array(GoldenSetEntrySchema).default([]),
  proximity_check: RoleBriefProximityCheckSchema.nullable().default(null),
  state: RoleBriefStateSchema.default("proposed"),
  created_at: z.string().min(1),
  updated_at: z.string().min(1)
});
const CreateExpertInputSchema = RoleBriefSchema.omit({
  id: true,
  version: true,
  state: true,
  proximity_check: true,
  created_at: true,
  updated_at: true
}).extend({
  /** Opt-in brief id so retries from the CEO are idempotent. */
  id: z.string().min(1).optional()
});
function newRoleBriefId(nowMs = Date.now(), rand) {
  const d = new Date(nowMs);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const r = rand ?? Math.random().toString(36).slice(2, 6);
  return `rb-${yyyy}${mm}${dd}-${r}`;
}
function roleFingerprint(input) {
  const parts = [
    input.role.toLowerCase().trim(),
    normalizeWs(input.mission),
    [...input.responsibilities].map(normalizeWs).sort().join("|")
  ];
  return hashString(parts.join("::"));
}
function normalizeWs(s) {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}
function hashString(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33 ^ s.charCodeAt(i)) >>> 0;
  }
  return `fp-${h.toString(36)}`;
}
export {
  CreateExpertInputSchema,
  GoldenSetEntrySchema,
  RequestedCapabilitiesSchema,
  RequiredIntegrationSchema,
  RoleBriefProximityCheckSchema,
  RoleBriefRequestedBySchema,
  RoleBriefSchema,
  RoleBriefStateSchema,
  TypicalIOSchema,
  newRoleBriefId,
  roleFingerprint
};
//# sourceMappingURL=role-brief.js.map
