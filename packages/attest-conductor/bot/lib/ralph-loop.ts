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
 * Map an attest validator script basename (e.g. `validate-architecture.sh`,
 * the shape `phase_gate_check` returns in `plannedValidators`) to the
 * per-validator MCP tool name attest-mcp advertises (`validate_<id>` where
 * `<id>` is dash-replaced-with-underscore, `.sh` stripped). Mirrors the
 * derivation in `packages/attest-mcp/src/validators/catalog.ts`
 * (`toolNameForValidator`). Keep in sync — a mismatch produces a `tool not
 * found` error at dispatch time.
 */
export function validatorScriptToToolName(script: string): string {
  const bareId = script
    .replace(/^validate[-_]/, "")
    .replace(/\.sh$/, "")
    .replace(/[^a-z0-9]+/gi, "_")
    .toLowerCase();
  return `validate_${bareId}`;
}

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
      ? args.phaseValidators
          .map((n) => `- ${n}  (MCP tool: \`${validatorScriptToToolName(n)}\`)`)
          .join("\n")
      : "(call attest-mcp `phase_gate_check` first; the response's `plannedValidators` field names the specific `validate_<name>` tools to run next)";

  const sdlcRules =
    args.sdlcRulesSnippet?.trim() ||
    "(call attest-mcp `phase_gate_check({ phase })` or the `attest://phase-gate/state-machine` resource to resolve the rules for this iteration)";

  const stateJson = JSON.stringify(renderStateForPrompt(args.task), null, 2);

  return [
    `You are the attest autopilot conductor for task ${args.task.taskId}.`,
    `Goal: ${args.task.goal}`,
    `Autonomy mode: ${args.task.autonomyMode} — ${describeAutonomyMode(args.task.autonomyMode)}`,
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
    "Experts available to dispatch (local hint catalog — attest-mcp's `list_experts` is authoritative):",
    expertList,
    "",
    "## Decide and perform the single next step toward the goal",
    "",
    "Pick exactly one of these tool actions, call it, then end the turn:",
    "",
    "- `invoke_expert` — Shape-C policy-mediated expert invocation. attest-mcp",
    "  evaluates policy, routes to the in-process handler or sandbox BDK",
    "  expert, and returns `{ outcome: 'expert_output' | 'policy_denied' |",
    "  'approval_required', ... }`. On `policy_denied`, escalate or route",
    "  differently — never retry blindly. On `approval_required`, call",
    "  `request_approval` first, then re-call `invoke_expert` with the resolved",
    "  `approvalId`.",
    "- `pre_dispatch_check` — Shape-C policy preview. Ask whether an expert",
    "  invocation would be allowed, denied, or require approval, WITHOUT",
    "  paying the dispatch cost. **Call this BEFORE `invoke_expert` on any",
    "  dispatch that may need approval.**",
    "- `request_approval` — HITL ask. Picks the best available transport (MCP",
    "  elicitation preferred when attached; GitHub comment-approve otherwise;",
    "  `pr:*` / `publish:*` under autonomy=approve-destructive prefer GitHub",
    "  for the paper trail). Returns `{ approved, reason, approvalId, transport,",
    "  source }`. Fail-closed when no transport is wired. On denial, escalate",
    "  or route differently — never retry blindly.",
    "- `set_autonomy_mode` — change the task's HITL strictness mid-task when the",
    "  user asks (e.g. 'be more careful' → `approve-each`).",
    "- `phase_gate_check` (attest-mcp) — read the current phase's gate.",
    "  The response's `plannedValidators` field lists the shell-script",
    "  basenames (e.g. `validate-architecture.sh`) that gate the next",
    "  phase; the MCP tool name is `validate_<id>` where `<id>` is the",
    "  basename stripped of `validate-` / `.sh` and dashes replaced by",
    "  underscores. **Call `phase_gate_check` BEFORE picking which",
    "  validator to run.**",
    "- `validate_<name>` (attest-mcp) — run one specific validator.",
    "  attest-mcp publishes 77 individual `validate_<name>` tools, one",
    "  per shell script; do NOT ask for a generic `validate(name)` —",
    "  pick the exact tool name you got from `plannedValidators`.",
    "- `advance_phase` — move to the next SDLC phase (attest-mcp approved).",
    "- `record_finding` — note a gap, soft issue, or halt condition.",
    "- `update_scratchpad` — rewrite your short working notes for the next turn.",
    "- `compact_state` — summarize prior findings when the state has grown.",
    "- `mark_done` — the goal is achieved. The loop ends.",
    "- `escalate` — you are stuck and need human review. The loop ends.",
    "",
    "## Dispatch flow (Shape C)",
    "",
    "Before dispatching to an expert that may need approval, call",
    "`pre_dispatch_check`. If it returns `require_approval`, call",
    "`request_approval` first. On denial, escalate or route differently —",
    "never retry blindly. The sequence is:",
    "",
    "    pre_dispatch_check → (if requires-approval) request_approval",
    "                       → invoke_expert → consume outcome",
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

function describeAutonomyMode(mode: ConductorTask["autonomyMode"]): string {
  switch (mode) {
    case "auto":
      return "auto-approve non-destructive; HITL for destructive; fail-closed when no transport.";
    case "approve-each":
      return "every destructive op asks a human.";
    case "approve-destructive":
      return "only destructive capabilities (shell:destructive, write:fs, git:write, pr:*, publish:*) ask.";
  }
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
    autonomyMode: task.autonomyMode,
    pendingApprovalIds: task.pendingApprovalIds,
    githubContext: task.githubContext
      ? {
          owner: task.githubContext.owner,
          repo: task.githubContext.repo,
          issueNumber: task.githubContext.issueNumber,
          kind: task.githubContext.kind,
        }
      : null,
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
