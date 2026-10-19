/**
 * Conductor state model + kv helpers (Shape-2 + Ralph loop).
 *
 * One **task** record per `/autopilot <goal>` invocation, keyed by task id.
 * One **active-pointer** record per session so `/autopilot resume` and
 * `/autopilot status` can find the live task without the model guessing.
 *
 * Nothing in module globals or local files — the serve process can be
 * replaced between turns on Cursor hosting (framework skill map).
 *
 * **No SDLC rules here.** Phase ordering, validator-per-phase mapping, and
 * gate conditions all belong to `attest-mcp`. This file carries runtime
 * shape only: who ran, what they returned, which gaps are open, how many
 * iterations have passed, which actionIds the loop has already applied.
 *
 * **Ralph discipline.** The TS loop driver re-prompts the agent every
 * iteration with the state rendered inline (`renderRalphPrompt` in
 * `ralph-loop.ts`). The agent decides one next action — one tool call —
 * and that tool mutates state here. The TS enforces thresholds (iteration
 * cap, consecutive-no-progress, wall time) and compacts state when it
 * grows past budget. No `if (phase === "build")` branches ever belong in
 * TS: new behavior goes into attest-mcp rules, the tool palette, or the
 * Ralph prompt.
 */

export type ValidatorRun = {
  name: string;
  ok: boolean;
  gapCount: number;
  severity?: "soft" | "gate";
};

export type GateVerdict = {
  phase: string;
  status: string;
  gapCount: number;
  receiptPath?: string | null;
};

export type ExpertVisit = {
  iteration: number;
  expertId: string;
  prompt: string;
  summary: string;
  status: "ok" | "escalated" | "failed";
  actionId: string;
  tsMs: number;
};

export type ConductorFinding = {
  source: string;
  severity: "soft" | "gate" | "halt";
  message: string;
  iteration: number;
  actionId?: string;
  tsMs: number;
};

export type PhaseChange = {
  phase: string;
  enteredAtMs: number;
  reason: string;
  actionId: string;
};

export type IterationLog = {
  iteration: number;
  action:
    | "dispatch_expert"
    | "validate"
    | "phase_gate_check"
    | "advance_phase"
    | "record_finding"
    | "update_scratchpad"
    | "compact_state"
    | "mark_done"
    | "escalate"
    | "noop";
  summary: string;
  tsMs: number;
};

export type ConductorTask = {
  taskId: string;
  goal: string;
  startedAtMs: number;
  endedAtMs: number | null;
  currentPhase: string;
  phaseHistory: PhaseChange[];
  visitedExperts: ExpertVisit[];
  iterationLog: IterationLog[];
  findings: ConductorFinding[];
  iteration: number;
  iterationCap: number;
  wallTimeCapMs: number;
  consecutiveNoProgress: number;
  consecutiveNoProgressCap: number;
  scratchpad: string;
  status: "running" | "halted" | "done";
  endReason: string | null;
  escalated: boolean;
  escalationReason: string | null;
  /** `actionId -> iteration` map so an idempotent retry can be short-circuited. */
  actionCache: Record<string, number>;
  lastSummary: string;
};

export const INITIAL_PHASE = "intake";
export const DEFAULT_ITERATION_CAP = 6;
export const DEFAULT_WALL_TIME_CAP_MS = 15 * 60 * 1_000;
export const DEFAULT_NO_PROGRESS_CAP = 3;

/** kv key for one task's record. */
export function taskKey(taskId: string): string {
  return `conductor:task:${taskId}`;
}

/** kv key for a session's active-task pointer (resume / status). */
export function activeTaskKey(sessionId: string): string {
  return `conductor:active:${sessionId}`;
}

export function newTaskId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `task_${Date.now().toString(36)}_${rand}`;
}

export function newTask(args: {
  goal: string;
  iterationCap?: number;
  wallTimeCapMs?: number;
  consecutiveNoProgressCap?: number;
}): ConductorTask {
  const now = Date.now();
  return {
    taskId: newTaskId(),
    goal: args.goal,
    startedAtMs: now,
    endedAtMs: null,
    currentPhase: INITIAL_PHASE,
    phaseHistory: [
      {
        phase: INITIAL_PHASE,
        enteredAtMs: now,
        reason: "conductor_begin",
        actionId: "conductor_begin",
      },
    ],
    visitedExperts: [],
    iterationLog: [],
    findings: [],
    iteration: 0,
    iterationCap: args.iterationCap ?? DEFAULT_ITERATION_CAP,
    wallTimeCapMs: args.wallTimeCapMs ?? DEFAULT_WALL_TIME_CAP_MS,
    consecutiveNoProgress: 0,
    consecutiveNoProgressCap:
      args.consecutiveNoProgressCap ?? DEFAULT_NO_PROGRESS_CAP,
    scratchpad: "",
    status: "running",
    endReason: null,
    escalated: false,
    escalationReason: null,
    actionCache: {},
    lastSummary: "",
  };
}

/**
 * Idempotency guard for a mutating tool. Returns `{ already: true, iteration }`
 * when `actionId` was already applied — callers short-circuit and return the
 * current state without mutating.
 */
export function alreadyApplied(
  task: ConductorTask,
  actionId: string,
): { already: true; iteration: number } | { already: false } {
  const prior = task.actionCache[actionId];
  if (typeof prior === "number") {
    return { already: true, iteration: prior };
  }
  return { already: false };
}

/**
 * Mark an action as applied. The caller is responsible for actually
 * mutating state in the same `put`.
 */
export function recordAction(
  task: ConductorTask,
  actionId: string,
  iteration: number,
): ConductorTask {
  return {
    ...task,
    actionCache: { ...task.actionCache, [actionId]: iteration },
  };
}
