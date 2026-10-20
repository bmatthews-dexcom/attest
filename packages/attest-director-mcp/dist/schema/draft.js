import { z } from "zod";
import { CapabilityMapSchema } from "./capabilities.js";
const FormFactorSchema = z.enum([
  "skill",
  "in-process-handler",
  "sandbox-bdk-agent"
]);
const FormFactorDecisionSchema = z.object({
  pick: FormFactorSchema,
  rationale: z.string().min(1),
  ruleFired: z.string().min(1).describe("Which \xA75.1 rule matched first (1..5 or 'default')."),
  alternatives: z.array(
    z.object({
      formFactor: FormFactorSchema,
      reasonNotPicked: z.string().min(1)
    })
  ).default([])
});
const PersonaSchema = z.object({
  markdown: z.string().min(1),
  lineCount: z.number().int().nonnegative(),
  negativesSection: z.string().optional().describe("The 'What this role does NOT do' section \u2014 load-bearing per aiwolfdial \xA7Technique.")
});
const SchemaArtifactSchema = z.object({
  jsonSchema: z.record(z.string(), z.unknown()),
  inputFields: z.array(z.string()).default([]),
  outputFields: z.array(z.string()).default([])
});
const FixtureSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  input: z.unknown(),
  expectedRubric: z.string().min(1),
  passCriteria: z.array(z.string().min(1)).default([]).describe("Promptfoo-shape pass criteria list.")
});
const EvalScoreSchema = z.object({
  fixtureId: z.string().min(1),
  score: z.number().min(0).max(1),
  passed: z.boolean(),
  judgeTrace: z.string().optional(),
  rubricNotes: z.string().optional()
});
const EvalReportSchema = z.object({
  scores: z.array(EvalScoreSchema),
  passRate: z.number().min(0).max(1),
  passBar: z.number().min(0).max(1).default(0.8),
  passed: z.boolean(),
  failingFixtures: z.array(z.string()).default([]),
  wholesaleFail: z.boolean().default(false)
});
const DraftArtifactIndexSchema = z.object({
  briefId: z.string().min(1),
  version: z.number().int().positive(),
  formFactor: FormFactorSchema,
  persona: PersonaSchema,
  schema: SchemaArtifactSchema,
  capabilities: CapabilityMapSchema,
  fixtures: z.array(FixtureSchema),
  evalReport: EvalReportSchema.optional(),
  createdAt: z.string().min(1)
});
const MAX_REDRAFT_ATTEMPTS = 3;
const EVAL_PASS_BAR = 0.8;
export {
  DraftArtifactIndexSchema,
  EVAL_PASS_BAR,
  EvalReportSchema,
  EvalScoreSchema,
  FixtureSchema,
  FormFactorDecisionSchema,
  FormFactorSchema,
  MAX_REDRAFT_ATTEMPTS,
  PersonaSchema,
  SchemaArtifactSchema
};
//# sourceMappingURL=draft.js.map
