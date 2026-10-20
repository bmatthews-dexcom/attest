import { defineTool } from "@cursor/bdk/tools";
import * as z from "zod/v4";
import {
  alreadyApplied,
  recordAction,
  taskKey,
  type ConductorTask,
  type IterationLog,
} from "../lib/conductor-state.js";
import {
  AUTONOMY_MODES,
  type AutonomyMode,
} from "../lib/autonomy.js";

type Result =
  | { ok: true; task: ConductorTask; priorMode: AutonomyMode; already?: boolean }
  | { ok: false; reason: "no-task" | "task-ended" };

export default defineTool({
  description:
    "Set the task's autonomy mode. `auto` (default; auto-approves non-destructive, HITL for destructive, fail-closed when no transport); `approve-each` (every destructive op asks a human); `approve-destructive` (only destructive capabilities — shell:destructive, write:fs, git:write, pr:*, publish:* — ask). The Ralph loop can call this mid-task when the user signals a trust change. Idempotent via `actionId`.",
  effect: "write",
  inputSchema: z.object({
    taskId: z.string(),
    mode: z.enum(AUTONOMY_MODES as unknown as [AutonomyMode, ...AutonomyMode[]]),
    reason: z.string().describe("Short why — surfaces in the iteration log and findings for audit."),
    actionId: z.string().describe("Deterministic id for idempotent retry."),
  }),
  async execute(input, ctx): Promise<Result> {
    const key = taskKey(input.taskId);
    const task = (await ctx.host.kv.get(key)) as ConductorTask | undefined;
    if (!task) return { ok: false, reason: "no-task" };
    if (task.status !== "running") return { ok: false, reason: "task-ended" };

    const dup = alreadyApplied(task, input.actionId);
    if (dup.already) {
      return { ok: true, task, priorMode: task.autonomyMode, already: true };
    }

    const priorMode = task.autonomyMode;
    const now = Date.now();
    const logEntry: IterationLog = {
      iteration: task.iteration,
      action: "set_autonomy_mode",
      summary: `${priorMode} → ${input.mode}: ${input.reason}`,
      tsMs: now,
    };
    const updated: ConductorTask = recordAction(
      {
        ...task,
        autonomyMode: input.mode,
        iterationLog: [...task.iterationLog, logEntry],
      },
      input.actionId,
      task.iteration,
    );
    await ctx.host.kv.put(key, updated);
    return { ok: true, task: updated, priorMode };
  },
});
