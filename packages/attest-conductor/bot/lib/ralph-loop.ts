/**
 * Ralph loop primitives.
 *
 * The TS loop driver is intentionally dumb: load state, render *the same*
 * Ralph prompt (only `state` changes), run one agent turn, re-load state,
 * repeat. The LLM is Ralph — simple, consistent, re-invoked.
 *
 * Everything "intelligent" lives in:
 * - **attest-mcp**: SDLC rules (phase ordering, which validators per phase,
 *   gate conditions). The agent reads them each turn via MCP tools /
 *   resources.
 * - **The tool palette**: `dispatch_expert`, `validate` (mcp),
 *   `phase_gate_check` (mcp), `advance_phase`, `record_finding`,
 *   `update_scratchpad`, `compact_state`, `mark_done`, `escalate`. Adding
 *   a new behavior means adding a tool or editing an MCP rule — never a
 *   TS branch.
 * - **The Ralph prompt**: this file. One template, stable across turns.
 *
 * The TS owns ONLY: the loop, kv load/save, prompt rendering, hard
 * thresholds (iteration cap, wall-time cap, consecutive-no-progress cap),
 * and compaction triggering (invoke `compact_state` when the state's
 * byte-size estimate exceeds a budget).
 */

import type { ConductorTask } from "./conductor-state.js";
import {
  DEFAULT_EXPERT_REGISTRY,
  type ExpertRegistryEntry,
} from "./experts-registry.js";

/** Approximate budget for the state blob rendered into the prompt. */
export const DEFAULT_SCRATCHPAD_COMPACT_THRESHOLD = 4_000;

/**
 * Why the TS loop should stop (or `null` to keep going).
 *
 * All thresholds are TS-owned. The agent's own `mark_done` / `escalate`
 * calls are enforced through `task.status` / `task.escalated` and surface
 * as `agent-decided-*` here.
 */
export type LoopStop =
  | { kind: "agent-decided-done"; reason: string }
  | { kind: "agent-decided-escalate"; reason: string }
  | { kind: "iteration-cap"; cap: number }
  | { kind: "wall-time-cap"; capMs: number; elapsedMs: number }
  | { kind: "consecutive-no-progress"; cap: number }
  | { kind: "task-not-running"; status: ConductorTask["status"] };

export function shouldStop(task: ConductorTask, nowMs: number = Date.now()): LoopStop | null {
  if (task.status === "done") {
    return { kind: "agent-decided-done", reason: task.endReason ?? "task marked done" };
  }
  if (task.status === "halted") {
    return task.escalated
      ? {
          kind: "agent-decided-escalate",
          reason: task.escalationReason ?? task.endReason ?? "escalated",
        }
      : { kind: "task-not-running", status: task.status };
  }
  if (task.iteration >= task.iterationCap) {
    return { kind: "iteration-cap", cap: task.iterationCap };
  }
  const elapsedMs = nowMs - task.startedAtMs;
  if (elapsedMs >= task.wallTimeCapMs) {
    return { kind: "wall-time-cap", capMs: task.wallTimeCapMs, elapsedMs };
  }
  if (task.consecutiveNoProgress >= task.consecutiveNoProgressCap) {
    return { kind: "consecutive-no-progress", cap: task.consecutiveNoProgressCap };
  }
  return null;
}

/** The Ralph prompt. Same shape every iteration — only `state` varies. */
export type RalphPromptArgs = {
  task: ConductorTask;
  /** Experts the conductor can actually dispatch today. */
  experts?: readonly ExpertRegistryEntry[];
  /**
   * Optional SDLC-rules snippet the loop driver pulled from attest-mcp
   * (`list_validators({ phase })`, `attest://phase-gate/state-machine`,
   * etc.). The loop fetches these each iteration so the prompt stays
   * self-contained; the TS does not interpret them.
   */
  sdlcRulesSnippet?: string;
  /** Validator-name list the loop driver pulled from attest-mcp. */
  phaseValidators?: readonly string[];
};

export function renderRalphPrompt(args: RalphPromptArgs): string {
  const experts = args.experts ?? DEFAULT_EXPERT_REGISTRY;
  const expertList = experts
    .map((e) => `- ${e.id} — ${e.description}`)
    .join("\n");
  const validatorList =
    args.phaseValidators && args.phaseValidators.length > 0
      ? args.phaseValidators.map((n) => `- ${n}`).join("\n")
      : "(call attest-mcp `list_validators({ phase })` yourself; the loop driver didn't pre-fetch any for this iteration)";

  const sdlcRules =
    args.sdlcRulesSnippet?.trim() ||
    "(call attest-mcp `phase_gate_check({ phase })` or the `attest://phase-gate/state-machine` resource to resolve the rules for this iteration)";

  const stateJson = JSON.stringify(renderStateForPrompt(args.task), null, 2);

  return [
    `You are the attest autopilot conductor for task ${args.task.taskId}.`,
    `Goal: ${args.task.goal}`,
    "",
    "Current state (compact JSON — the only thing that changes between iterations):",
    "```json",
    stateJson,
    "```",
    "",
    "SDLC rules for this iteration (from attest-mcp):",
    sdlcRules,
    "",
    "Validators relevant to the current phase:",
    validatorList,
    "",
    "Experts available to dispatch:",
    expertList,
    "",
    "## Decide and perform the single next step toward the goal",
    "",
    "Pick exactly one of these tool actions, call it, then end the turn:",
    "",
    "- `dispatch_expert` — run an expert BDK agent on one unit of work.",
    "- `validate` (attest-mcp) — run one validator on scope.",
    "- `phase_gate_check` (attest-mcp) — read the current phase's gate.",
    "- `advance_phase` — move to the next SDLC phase (attest-mcp approved).",
    "- `record_finding` — note a gap, soft issue, or halt condition.",
    "- `update_scratchpad` — rewrite your short working notes for the next turn.",
    "- `compact_state` — summarize prior findings when the state has grown.",
    "- `mark_done` — the goal is achieved. The loop ends.",
    "- `escalate` — you are stuck and need human review. The loop ends.",
    "",
    "**Idempotency.** Every mutating tool takes an `actionId` string. Make",
    "it a short, deterministic hash of (iteration + action-intent) so a",
    "crash-and-resume cannot double-execute.",
    "",
    "**Do not** write imperative branches in your head (`if phase === X,",
    "then …`). Read the SDLC rules + the state + your scratchpad, and let",
    "those decide.",
  ].join("\n");
}

/**
 * Compact view of the task for the Ralph prompt. Drops heavy fields
 * (`iterationLog`, full `actionCache`) so the prompt stays bounded; the
 * agent reads detail via `conductor_get_state` when it needs more.
 */
export function renderStateForPrompt(task: ConductorTask) {
  return {
    taskId: task.taskId,
    status: task.status,
    currentPhase: task.currentPhase,
    iteration: task.iteration,
    iterationCap: task.iterationCap,
    consecutiveNoProgress: task.consecutiveNoProgress,
    consecutiveNoProgressCap: task.consecutiveNoProgressCap,
    recentPhaseHistory: task.phaseHistory.slice(-3),
    lastExpert: task.visitedExperts.at(-1) ?? null,
    openFindings: task.findings
      .filter((f) => f.severity !== "soft")
      .slice(-5),
    softFindingCount: task.findings.filter((f) => f.severity === "soft").length,
    scratchpad: task.scratchpad,
    lastSummary: task.lastSummary,
    escalated: task.escalated,
    escalationReason: task.escalationReason,
  };
}

/** Approximate rendered-prompt size — triggers compaction when exceeded. */
export function approxStateSize(task: ConductorTask): number {
  return (
    JSON.stringify(renderStateForPrompt(task)).length +
    task.scratchpad.length +
    task.findings.reduce((sum, f) => sum + f.message.length, 0) +
    task.visitedExperts.reduce((sum, v) => sum + v.summary.length, 0)
  );
}

export function needsCompaction(
  task: ConductorTask,
  threshold: number = DEFAULT_SCRATCHPAD_COMPACT_THRESHOLD,
): boolean {
  return approxStateSize(task) > threshold;
}
