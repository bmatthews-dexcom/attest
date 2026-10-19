import { defineTool } from "@cursor/bdk/tools";
import * as z from "zod/v4";
import {
  alreadyApplied,
  recordAction,
  taskKey,
  type ConductorTask,
  type IterationLog,
} from "../lib/conductor-state.js";

type Result =
  | { ok: true; task: ConductorTask; already?: boolean }
  | { ok: false; reason: "no-task" | "task-ended" };

export default defineTool({
  description:
    "Rewrite the task's short working notes (`scratchpad`) for the next Ralph iteration. This is the classic STATE.md pattern: the agent reads prior intent + why in the scratchpad, decides a next step, writes a terse record of the intent + reasoning here. Keep it short (budget: ~1-2 KB) — the loop driver will call `compact_state` when the whole state blob grows past its prompt budget.",
  effect: "write",
  inputSchema: z.object({
    taskId: z.string(),
    scratchpad: z
      .string()
      .max(8_000)
      .describe("Your terse working notes for the next iteration."),
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
    const logEntry: IterationLog = {
      iteration: task.iteration,
      action: "update_scratchpad",
      summary: `scratchpad updated (${input.scratchpad.length} chars)`,
      tsMs: now,
    };
    const updated: ConductorTask = recordAction(
      {
        ...task,
        scratchpad: input.scratchpad,
        iterationLog: [...task.iterationLog, logEntry],
      },
      input.actionId,
      task.iteration,
    );
    await ctx.host.kv.put(key, updated);
    return { ok: true, task: updated };
  },
});
