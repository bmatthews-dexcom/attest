import { defineTool, type ToolContext } from "@cursor/bdk/tools";
import * as z from "zod/v4";
import {
  activeTaskKey,
  AUTONOMY_MODES,
  newTask,
  taskKey,
  type AutonomyMode,
  type ConductorTask,
} from "../lib/conductor-state.js";
import {
  needsCompaction,
  renderRalphPrompt,
  shouldStop,
  type LoopStop,
} from "../lib/ralph-loop.js";

type Result = {
  taskId: string;
  stop: LoopStop;
  task: ConductorTask;
  turns: number;
};

export default defineTool({
  description:
    "Chat entry for the autopilot. Creates a task, drives the Ralph loop by starting one agent turn per iteration on the HTTP channel, and returns the final task once the loop stops. The agent should call this when the user types `/autopilot <goal>` on the chat surface. Behind the scenes this is the same loop the `/v1/channels/autopilot/run` HTTP route runs — kept here as a tool so chat / eval sessions can invoke it directly.",
  effect: "write",
  inputSchema: z.object({
    goal: z.string().min(1),
    iterationCap: z.number().int().positive().max(50).optional(),
    wallTimeCapMs: z
      .number()
      .int()
      .positive()
      .max(60 * 60 * 1000)
      .optional(),
    consecutiveNoProgressCap: z.number().int().positive().max(20).optional(),
    maxTurns: z.number().int().positive().max(100).default(10),
    autonomyMode: z
      .enum(AUTONOMY_MODES as unknown as [AutonomyMode, ...AutonomyMode[]])
      .optional()
      .describe("Initial autonomy mode. Default `auto`. Use `approve-each` or `approve-destructive` to raise the HITL bar for this run."),
  }),
  async execute(input, ctx): Promise<Result> {
    const task = newTask({
      goal: input.goal,
      iterationCap: input.iterationCap,
      wallTimeCapMs: input.wallTimeCapMs,
      consecutiveNoProgressCap: input.consecutiveNoProgressCap,
      autonomyMode: input.autonomyMode,
    });
    await ctx.host.kv.put(taskKey(task.taskId), task);
    await ctx.host.kv.put(activeTaskKey(ctx.session.id), { taskId: task.taskId });

    let current = task;
    let stop: LoopStop | null = shouldStop(current);
    let turnsSpent = 0;

    while (!stop && turnsSpent < input.maxTurns) {
      if (needsCompaction(current) && !current.scratchpad) {
        const prompt = buildCompactPrompt(current);
        await runOneRalphTurn(ctx, prompt, current.taskId);
        current = ((await ctx.host.kv.get(taskKey(current.taskId))) as ConductorTask) ?? current;
        turnsSpent++;
        stop = shouldStop(current);
        if (stop) break;
      }

      const prompt = renderRalphPrompt({ task: current });
      await runOneRalphTurn(ctx, prompt, current.taskId);
      turnsSpent++;

      current = ((await ctx.host.kv.get(taskKey(current.taskId))) as ConductorTask) ?? current;
      stop = shouldStop(current);
    }

    if (!stop) {
      stop = { kind: "iteration-cap", cap: input.maxTurns };
    }

    return { taskId: current.taskId, stop, task: current, turns: turnsSpent };
  },
});

async function runOneRalphTurn(
  ctx: ToolContext,
  prompt: string,
  taskId: string,
): Promise<void> {
  const session = await ctx.send("http", prompt, {
    continuationToken: `autopilot-tool:${taskId}`,
  });
  await session.waitForCompletion();
}

function buildCompactPrompt(task: ConductorTask): string {
  return [
    `You are the attest autopilot conductor for task ${task.taskId}.`,
    `The task state has grown past the prompt budget. Call \`compact_state\` once:`,
    `- summarize the ${task.findings.length} findings into a short paragraph that`,
    `  preserves every open gap and every validator that is still failing;`,
    `- keep the 5 most recent findings verbatim;`,
    `- use actionId: "compact-${task.iteration}".`,
    `After that one tool call, end the turn.`,
  ].join("\n");
}
