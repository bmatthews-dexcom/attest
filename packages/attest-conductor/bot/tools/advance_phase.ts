import { defineTool } from "@cursor/bdk/tools";
import * as z from "zod/v4";
import {
  alreadyApplied,
  recordAction,
  taskKey,
  type ConductorTask,
  type IterationLog,
  type PhaseChange,
} from "../lib/conductor-state.js";

type Result =
  | { ok: true; task: ConductorTask; already?: boolean }
  | { ok: false; reason: "no-task" | "task-ended" };

export default defineTool({
  description:
    "Advance the task to a new SDLC phase. The attest-mcp phase-gate rule for the current phase must have returned a status allowing the move; this tool only records the decision, it does not re-check the gate. Idempotent via `actionId` — re-sending the same id returns the current state without mutating.",
  effect: "write",
  inputSchema: z.object({
    taskId: z.string(),
    phase: z.string().describe("Target phase (from attest-mcp's phase_gate_check.nextPhase)."),
    reason: z.string().describe("Why — usually the gate's receipt note."),
    actionId: z.string().describe("Deterministic id for idempotent retry."),
  }),
  async execute(input, ctx): Promise<Result> {
    const key = taskKey(input.taskId);
    const task = (await ctx.host.kv.get(key)) as ConductorTask | undefined;
    if (!task) return { ok: false, reason: "no-task" };
    if (task.status !== "running") return { ok: false, reason: "task-ended" };

    const dup = alreadyApplied(task, input.actionId);
    if (dup.already) {
      return { ok: true, task, already: true };
    }

    const now = Date.now();
    const change: PhaseChange = {
      phase: input.phase,
      enteredAtMs: now,
      reason: input.reason,
      actionId: input.actionId,
    };
    const logEntry: IterationLog = {
      iteration: task.iteration,
      action: "advance_phase",
      summary: `${task.currentPhase} → ${input.phase}: ${input.reason}`,
      tsMs: now,
    };
    const updated = recordAction(
      {
        ...task,
        currentPhase: input.phase,
        phaseHistory: [...task.phaseHistory, change],
        iterationLog: [...task.iterationLog, logEntry],
        consecutiveNoProgress: 0,
      },
      input.actionId,
      task.iteration,
    );
    await ctx.host.kv.put(key, updated);
    return { ok: true, task: updated };
  },
});
