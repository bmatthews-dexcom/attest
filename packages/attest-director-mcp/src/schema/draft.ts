/**
 * Draft artifacts — the Phase 3 expert-draft set.
 *
 * See `docs/attest-director-architecture.md` §4.3. Every draft lives under
 * `/cursor/stores/<id>/experts-private/<id>/draft/<version>/`. Versions let
 * Director re-draft without losing history (§11).
 */
import { z } from "zod";
import { CapabilityMapSchema } from "./capabilities.js";

export const FormFactorSchema = z.enum([
  "skill",
  "in-process-handler",
  "sandbox-bdk-agent",
]);
export type FormFactor = z.infer<typeof FormFactorSchema>;

export const FormFactorDecisionSchema = z.object({
  pick: FormFactorSchema,
  rationale: z.string().min(1),
  ruleFired: z
    .string()
    .min(1)
    .describe("Which §5.1 rule matched first (1..5 or 'default')."),
  alternatives: z
    .array(
      z.object({
        formFactor: FormFactorSchema,
        reasonNotPicked: z.string().min(1),
      }),
    )
    .default([]),
});
export type FormFactorDecision = z.infer<typeof FormFactorDecisionSchema>;

export const PersonaSchema = z.object({
  markdown: z.string().min(1),
  lineCount: z.number().int().nonnegative(),
  negativesSection: z
    .string()
    .optional()
    .describe("The 'What this role does NOT do' section — load-bearing per aiwolfdial §Technique."),
});
export type Persona = z.infer<typeof PersonaSchema>;

export const SchemaArtifactSchema = z.object({
  jsonSchema: z.record(z.string(), z.unknown()),
  inputFields: z.array(z.string()).default([]),
  outputFields: z.array(z.string()).default([]),
});
export type SchemaArtifact = z.infer<typeof SchemaArtifactSchema>;

export const FixtureSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  input: z.unknown(),
  expectedRubric: z.string().min(1),
  passCriteria: z
    .array(z.string().min(1))
    .default([])
    .describe("Promptfoo-shape pass criteria list."),
});
export type Fixture = z.infer<typeof FixtureSchema>;

export const EvalScoreSchema = z.object({
  fixtureId: z.string().min(1),
  score: z.number().min(0).max(1),
  passed: z.boolean(),
  judgeTrace: z.string().optional(),
  rubricNotes: z.string().optional(),
});
export type EvalScore = z.infer<typeof EvalScoreSchema>;

export const EvalReportSchema = z.object({
  scores: z.array(EvalScoreSchema),
  passRate: z.number().min(0).max(1),
  passBar: z.number().min(0).max(1).default(0.8),
  passed: z.boolean(),
  failingFixtures: z.array(z.string()).default([]),
  wholesaleFail: z.boolean().default(false),
});
export type EvalReport = z.infer<typeof EvalReportSchema>;

export const DraftArtifactIndexSchema = z.object({
  briefId: z.string().min(1),
  version: z.number().int().positive(),
  formFactor: FormFactorSchema,
  persona: PersonaSchema,
  schema: SchemaArtifactSchema,
  capabilities: CapabilityMapSchema,
  fixtures: z.array(FixtureSchema),
  evalReport: EvalReportSchema.optional(),
  createdAt: z.string().min(1),
});
export type DraftArtifactIndex = z.infer<typeof DraftArtifactIndexSchema>;

/** Hard cap on redraft attempts per the §4.4 bounded loop. */
export const MAX_REDRAFT_ATTEMPTS = 3;

/** Phase-4 pass bar (per `docs/attest-director-architecture.md` §4.4). */
export const EVAL_PASS_BAR = 0.8;
