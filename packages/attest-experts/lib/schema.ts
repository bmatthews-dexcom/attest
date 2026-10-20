/**
 * Shared input / output contract between the attest conductor and every
 * expert agent in this pack.
 *
 * Keep this file the single source of truth: every expert's `submit_report`
 * tool validates against {@link expertOutputSchema}, every conductor
 * dispatch should serialize {@link expertInputSchema}, and both the
 * attest-mcp and attest-conductor packages consume these schemas verbatim.
 */
import * as z from "zod/v4";

export const findingSeveritySchema = z.enum(["low", "medium", "high", "critical"]);
export type FindingSeverity = z.infer<typeof findingSeveritySchema>;

export const findingSchema = z.object({
  id: z
    .string()
    .min(1)
    .describe("Stable finding id — e.g. `SEC-001`, scoped to this expert run."),
  severity: findingSeveritySchema,
  title: z.string().min(1).describe("One-line summary of the finding."),
  evidence: z
    .string()
    .min(1)
    .describe("file:line, URL, validator output, or quoted snippet that grounds the finding."),
  fix: z
    .string()
    .optional()
    .describe("Suggested remediation (short); omit when the expert only reports."),
  effort: z
    .enum(["trivial", "small", "medium", "large"])
    .optional()
    .describe("Rough implementation effort for the fix, when known."),
  module: z
    .string()
    .optional()
    .describe("Logical module key — synthesizers compound findings sharing this key."),
});
export type Finding = z.infer<typeof findingSchema>;

export const artifactRefSchema = z.object({
  path: z
    .string()
    .min(1)
    .describe("Path (relative to the task workspace) of a durable artifact this expert produced."),
  description: z.string().min(1),
  kind: z
    .enum(["report", "findings", "diagram", "patch", "data", "other"])
    .default("other"),
});
export type ArtifactRef = z.infer<typeof artifactRefSchema>;

export const priorFindingSchema = z.object({
  expert: z.string().min(1).describe("Expert id that produced this finding."),
  summary: z.string().min(1),
  artifact: z.string().optional(),
  severity: findingSeveritySchema.optional(),
});
export type PriorFinding = z.infer<typeof priorFindingSchema>;

/**
 * The conductor sends this payload (JSON) as the agent's user message. The
 * expert agent is expected to parse it from the opening message, run its
 * methodology, and finish by calling `submit_report` with
 * {@link expertOutputSchema}.
 */
export const expertInputSchema = z.object({
  task_id: z
    .string()
    .min(1)
    .describe("Conductor-assigned task id; keys this expert's `ctx.host.kv` namespace."),
  goal: z
    .string()
    .min(1)
    .describe("Natural-language description of what the conductor wants done."),
  current_phase: z
    .string()
    .min(1)
    .describe("Attest SDLC phase id (e.g. `phase-3-design`, `phase-5-review`)."),
  context_refs: z
    .array(z.string().min(1))
    .default([])
    .describe("Paths, URLs, or ids the expert should ground on first."),
  prior_findings: z
    .array(priorFindingSchema)
    .default([])
    .describe("Findings from earlier experts in this task; the current expert should not re-report them."),
  constraints: z
    .object({
      max_findings: z.number().int().positive().optional(),
      max_runtime_seconds: z.number().int().positive().optional(),
      write_scope: z
        .array(z.string())
        .optional()
        .describe("Paths this expert is allowed to write; empty / omitted means report-only."),
    })
    .partial()
    .default({}),
});
export type ExpertInput = z.infer<typeof expertInputSchema>;

export const expertOutputSchema = z.object({
  task_id: z.string().min(1),
  expert_id: z.string().min(1),
  findings: z.array(findingSchema).default([]),
  suggested_next_phase: z
    .string()
    .nullable()
    .default(null)
    .describe("The attest phase id the conductor should move to next, or null to stay."),
  blockers: z
    .array(z.string().min(1))
    .default([])
    .describe("Reasons the expert could not complete; each must cite evidence."),
  artifacts: z.array(artifactRefSchema).default([]),
  done: z
    .boolean()
    .describe("True when the expert has fully completed its contribution for this task_id."),
  summary: z
    .string()
    .min(1)
    .describe("One-paragraph plain-language summary the conductor can show to the user."),
});
export type ExpertOutput = z.infer<typeof expertOutputSchema>;

/**
 * KV namespacing helper: experts use this when reading / writing their own
 * per-task state so two experts (or two tasks) cannot collide.
 */
export function expertKvKey(expertId: string, taskId: string, suffix: string): string {
  return `attest/experts/${expertId}/${taskId}/${suffix}`;
}
