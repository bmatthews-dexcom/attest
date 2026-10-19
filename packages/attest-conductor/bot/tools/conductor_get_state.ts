import { defineTool } from "@cursor/bdk/tools";
import * as z from "zod/v4";
import {
  activeTaskKey,
  taskKey,
  type ConductorTask,
} from "../lib/conductor-state.js";

type ActivePointer = { taskId: string };

type Result =
  | { present: true; task: ConductorTask; wasActivePointer: boolean }
  | { present: false; reason: "no-active-task" | "task-not-found" };

export default defineTool({
  description:
    "Read the conductor task for this session. Pass `taskId` for a specific task; omit it to resolve the session's active-task pointer (set by `conductor_begin`). Returns `{ present: false }` when neither resolves — the prompt uses that as the signal to greet or ask for a goal.",
  effect: "read",
  inputSchema: z.object({
    taskId: z.string().optional(),
  }),
  async execute({ taskId }, ctx): Promise<Result> {
    let resolvedId: string | undefined = taskId;
    let fromPointer = false;
    if (!resolvedId) {
      const pointer = (await ctx.host.kv.get(activeTaskKey(ctx.session.id))) as
        | ActivePointer
        | undefined;
      if (!pointer?.taskId) {
        return { present: false, reason: "no-active-task" };
      }
      resolvedId = pointer.taskId;
      fromPointer = true;
    }
    const task = (await ctx.host.kv.get(taskKey(resolvedId))) as
      | ConductorTask
      | undefined;
    if (!task) {
      return { present: false, reason: "task-not-found" };
    }
    return { present: true, task, wasActivePointer: fromPointer };
  },
});
