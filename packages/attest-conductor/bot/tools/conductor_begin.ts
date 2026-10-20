import { defineTool } from "@cursor/bdk/tools";
import * as z from "zod/v4";
import {
  DEFAULT_ITERATION_CAP,
  activeTaskKey,
  newTask,
  taskKey,
  type ConductorTask,
} from "../lib/conductor-state.js";

export default defineTool({
  description:
    "Start a new conductor task for the current session. Writes the task record to ctx.host.kv at `conductor:task:<taskId>` and sets the session's active-task pointer at `conductor:active:<sessionId>`. Returns the fresh task so the prompt knows the taskId it must pass to subsequent tools.",
  effect: "write",
  inputSchema: z.object({
    goal: z.string().min(1).describe("Natural-language goal to run the loop against."),
    iterationCap: z
      .number()
      .int()
      .positive()
      .max(50)
      .optional()
      .describe(`Max iterations before halt. Default ${DEFAULT_ITERATION_CAP}.`),
  }),
  async execute({ goal, iterationCap }, ctx): Promise<ConductorTask> {
    const task = newTask({ goal, iterationCap });
    await ctx.host.kv.put(taskKey(task.taskId), task);
    await ctx.host.kv.put(activeTaskKey(ctx.session.id), { taskId: task.taskId });
    return task;
  },
});
