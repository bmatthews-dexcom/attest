import * as z from "zod/v4";

/**
 * Inline stub for the sibling `@bpmforge/attest-mcp` server.
 *
 * These handlers return canned, deterministic responses so the conductor
 * skeleton (and its eval) can prove end-to-end without the real MCP server
 * being published. Tool names, inputs, and outputs are the ones the
 * conductor's prompt and the design report expect — flagged in the PR body
 * for the sibling attest-mcp worker to confirm or correct.
 *
 * **Not shipped behavior.** The real attest-mcp owns these contracts;
 * nothing in this file is authoritative.
 */

export type AttestStubTool = {
  description: string;
  inputSchema: z.ZodType;
  execute: (input: Record<string, unknown>) => Promise<unknown> | unknown;
};

const PHASES = ["intake", "discover", "design", "build", "verify", "done"] as const;
type Phase = (typeof PHASES)[number];

function nextPhase(current: Phase): Phase {
  const i = PHASES.indexOf(current);
  if (i < 0 || i === PHASES.length - 1) {
    return "done";
  }
  return PHASES[i + 1]!;
}

/**
 * Representative stub validators. Four are enough to prove the per-validator
 * dispatch surface in evals without ballooning the stub catalog; the real
 * attest-mcp publishes 77. Keep the ids snake_case so the derived tool names
 * (`validate_<id>`) match the catalog derivation in attest-mcp.
 */
const STUB_VALIDATORS = [
  "architecture",
  "handoff_discipline",
  "completion_manifest",
  "code_health",
] as const;

function buildPerValidatorStubs(): Record<string, AttestStubTool> {
  const out: Record<string, AttestStubTool> = {};
  for (const id of STUB_VALIDATORS) {
    const toolName = `validate_${id}`;
    out[toolName] = {
      description: `attest-mcp stub: run the ${id.replaceAll("_", "-")} validator and return the gap-list envelope the real script produces.`,
      inputSchema: z.object({
        scope: z.array(z.string()).optional(),
        projectRoot: z.string().optional(),
      }),
      execute(input) {
        return {
          id,
          toolName,
          ok: true,
          severity: "gate",
          gaps: [],
          receipt: {
            stubbed: true,
            scope: input.scope ?? [],
            projectRoot: input.projectRoot ?? null,
          },
        };
      },
    };
  }
  return out;
}

export const attestStubTools: Record<string, AttestStubTool> = {
  route_goal: {
    description:
      "attest-mcp stub: pick the expert / phase for a goal. Returns the next unit and the validator names the conductor should run after delegating.",
    inputSchema: z.object({
      goal: z.string().min(1),
      context: z.string().optional(),
      currentPhase: z.enum(PHASES).optional(),
    }),
    execute(input) {
      const goal = String(input.goal ?? "").toLowerCase();
      const current = (input.currentPhase as Phase | undefined) ?? "intake";
      let expert = "guide";
      if (/security|vuln|cve|auth/.test(goal)) expert = "security-reviewer";
      else if (/perf|latency|benchmark/.test(goal)) expert = "performance";
      else if (/review|refactor|dead code/.test(goal)) expert = "code-reviewer";
      else if (/test|coverage/.test(goal)) expert = "test-author";
      else if (/doc|readme/.test(goal)) expert = "docs";
      const next = nextPhase(current);
      return {
        expert,
        rationale: `stub route for "${input.goal}" (phase ${current} → ${next})`,
        nextPhase: next,
        unit: {
          id: `${expert}-${next}`,
          description: `Have ${expert} drive the ${next} phase for: ${input.goal}`,
          writeScope: ["(stubbed)"],
        },
        expectedValidators: ["validate-architecture", "validate-handoff-discipline"],
      };
    },
  },
  list_validators: {
    description:
      "attest-mcp stub: list validators attest knows about, optionally scoped to a phase. Each entry's `toolName` is the exact MCP tool to call for that validator.",
    inputSchema: z.object({ phase: z.enum(PHASES).optional() }),
    execute() {
      return {
        validators: STUB_VALIDATORS.map((id) => ({
          id,
          toolName: `validate_${id}`,
          description: "stub",
        })),
      };
    },
  },
  phase_gate_check: {
    description:
      "attest-mcp stub: evaluate the phase gate for the given phase. Returns status, gaps, a receipt path, and `plannedValidators` (shell-script basenames) that gate the target phase. The caller should map each basename to the MCP tool `validate_<id>` (dash → underscore) and call them directly.",
    inputSchema: z.object({
      phase: z.enum(PHASES),
    }),
    execute(input) {
      const phase = input.phase as Phase;
      const status = phase === "done" ? "done" : "green";
      return {
        phase,
        status,
        gaps: [],
        nextPhase: nextPhase(phase),
        receiptPath: `docs/work/gates/${phase}.json`,
        plannedValidators: STUB_VALIDATORS.map((id) => `validate-${id.replaceAll("_", "-")}.sh`),
      };
    },
  },
  ...buildPerValidatorStubs(),
};
