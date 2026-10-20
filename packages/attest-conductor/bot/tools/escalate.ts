import { defineTool } from "@cursor/bdk/tools";
import * as z from "zod/v4";
import {
  activeTaskKey,
  alreadyApplied,
  recordAction,
  taskKey,
  type ConductorTask,
  type IterationLog,
} from "../lib/conductor-state.js";

type Result =
  | { ok: true; task: ConductorTask; already?: boolean }
  | { ok: false; reason: "no-task" | "already-ended" };

export default defineTool({
  description:
    "Escalate the task to a human. The Ralph loop will stop on the next iteration with status=halted + escalated=true. Use when the agent is stuck (repeated validator failures, missing credentials, NEVER-AUTO trigger, or when the TS loop's thresholds would halt anyway and you want to surface the specific reason). Idempotent via `actionId`.",
  effect: "write",
  inputSchema: z.object({
    taskId: z.string(),
    reason: z.string().describe("Why — what needs the human."),
    actionId: z.string().describe("Deterministic id for idempotent retry."),
  }),
  async execute(input, ctx): Promise<Result> {
    const key = taskKey(input.taskId);
    const task = (await ctx.host.kv.get(key)) as ConductorTask | undefined;
    if (!task) return { ok: false, reason: "no-task" };
    if (task.status === "done" || task.status === "halted") {
      return { ok: false, reason: "already-ended" };
    }

    const dup = alreadyApplied(task, input.actionId);
    if (dup.already) {
      return { ok: true, task, already: true };
    }

    const now = Date.now();
    const logEntry: IterationLog = {
      iteration: task.iteration,
      action: "escalate",
      summary: input.reason,
      tsMs: now,
    };
    const updated: ConductorTask = recordAction(
      {
        ...task,
        status: "halted",
        escalated: true,
        escalationReason: input.reason,
        endReason: `escalated: ${input.reason}`,
        endedAtMs: now,
        iterationLog: [...task.iterationLog, logEntry],
      },
      input.actionId,
      task.iteration,
    );
    await ctx.host.kv.put(key, updated);
    await ctx.host.kv.delete(activeTaskKey(ctx.session.id));
    return { ok: true, task: updated };
  },
});
