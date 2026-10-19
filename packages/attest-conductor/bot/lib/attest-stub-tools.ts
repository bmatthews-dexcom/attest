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
      "attest-mcp stub: list validators attest knows about, optionally scoped to a phase.",
    inputSchema: z.object({ phase: z.enum(PHASES).optional() }),
    execute() {
      return {
        validators: [
          { name: "validate-architecture", description: "stub" },
          { name: "validate-handoff-discipline", description: "stub" },
          { name: "validate-completion-manifest", description: "stub" },
          { name: "validate-code-health", description: "stub" },
        ],
      };
    },
  },
  validate: {
    description:
      "attest-mcp stub: run one named validator. Returns the gap-list envelope the real validator produces.",
    inputSchema: z.object({
      name: z.string().min(1),
      scope: z.array(z.string()).optional(),
    }),
    execute(input) {
      return {
        name: String(input.name),
        ok: true,
        severity: "gate",
        gaps: [],
        receipt: {
          stubbed: true,
          scope: input.scope ?? [],
        },
      };
    },
  },
  phase_gate_check: {
    description:
      "attest-mcp stub: evaluate the phase gate for the given phase. Returns status, gaps, and a receipt path.",
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
      };
    },
  },
};
