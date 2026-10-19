import { defineChannel, POST, GET } from "@cursor/bdk/channels";
import * as z from "zod/v4";
import {
  activeTaskKey,
  newTask,
  taskKey,
  type ConductorTask,
} from "../lib/conductor-state.js";
import {
  needsCompaction,
  renderRalphPrompt,
  shouldStop,
  type LoopStop,
} from "../lib/ralph-loop.js";

/**
 * Autopilot channel — the Ralph loop driver.
 *
 * One route: `POST /run`. The handler is the entire loop:
 *
 *   create task (unless caller passed taskId)
 *   while (!stop) {
 *     reload task from kv
 *     render Ralph prompt
 *     send(prompt, { continuationToken: taskId })
 *     waitForCompletion()
 *   }
 *   return final task
 *
 * No `if (phase === "build")` branches, no agent-side orchestration. The
 * TS stops the loop on five conditions (see `shouldStop`); everything
 * else is agent reasoning + tool calls on each turn.
 */

const RunBody = z.object({
  goal: z.string().min(1),
  taskId: z.string().optional(),
  iterationCap: z.number().int().positive().max(50).optional(),
  wallTimeCapMs: z.number().int().positive().max(60 * 60 * 1000).optional(),
  consecutiveNoProgressCap: z.number().int().positive().max(20).optional(),
  /** Hard safety: never dispatch more than this many Ralph turns per POST. */
  maxTurns: z.number().int().positive().max(100).default(20),
});

const StatusQuery = z.object({ taskId: z.string() });

type RunResponseBody = {
  taskId: string;
  stop: LoopStop;
  task: ConductorTask;
  turns: number;
};

export default defineChannel({
  routes: [
    POST("/run", {
      bodySchema: RunBody,
      description:
        "Create or resume a conductor task, then drive the Ralph loop until a stop condition fires. Returns the final task + why the loop stopped.",
      handler: async (_req, args) => {
        const { body, send, host } = args as typeof args & { body: z.infer<typeof RunBody> };
        let task = await loadOrCreateTask(host as unknown as { kv: HostKv }, body);

        let turnsSpent = 0;
        let stop: LoopStop | null = shouldStop(task);
        while (!stop && turnsSpent < body.maxTurns) {
          if (needsCompaction(task) && !task.scratchpad) {
            const prompt = buildCompactPrompt(task);
            await runOneRalphTurn(send, prompt, task.taskId);
            task = (await host.kv.get(taskKey(task.taskId))) as ConductorTask;
            turnsSpent++;
            stop = shouldStop(task);
            if (stop) break;
          }

          const prompt = renderRalphPrompt({ task });
          await runOneRalphTurn(send, prompt, task.taskId);
          turnsSpent++;

          task = (await host.kv.get(taskKey(task.taskId))) as ConductorTask;
          stop = shouldStop(task);
        }

        if (!stop) {
          stop = { kind: "iteration-cap", cap: body.maxTurns };
        }

        const payload: RunResponseBody = { taskId: task.taskId, stop, task, turns: turnsSpent };
        return Response.json(payload);
      },
    }),
    GET("/status", {
      querySchema: StatusQuery,
      description: "Read-only task snapshot.",
      handler: async (_req, args) => {
        const { query, host } = args as typeof args & { query: z.infer<typeof StatusQuery> };
        const task = (await host.kv.get(taskKey(query.taskId))) as
          | ConductorTask
          | undefined;
        if (!task) {
          return Response.json({ ok: false, reason: "no-task" }, { status: 404 });
        }
        return Response.json({ ok: true, task });
      },
    }),
  ],
});

type HostKv = {
  get(key: string): Promise<unknown>;
  put(key: string, value: ConductorTask | { taskId: string }): Promise<void>;
};

async function loadOrCreateTask(
  host: { kv: HostKv },
  body: z.infer<typeof RunBody>,
): Promise<ConductorTask> {
  if (body.taskId) {
    const existing = (await host.kv.get(taskKey(body.taskId))) as
      | ConductorTask
      | undefined;
    if (existing) {
      return existing;
    }
  }
  const fresh = newTask({
    goal: body.goal,
    iterationCap: body.iterationCap,
    wallTimeCapMs: body.wallTimeCapMs,
    consecutiveNoProgressCap: body.consecutiveNoProgressCap,
  });
  await host.kv.put(taskKey(fresh.taskId), fresh);
  await host.kv.put(activeTaskKey("autopilot-channel"), { taskId: fresh.taskId });
  return fresh;
}

async function runOneRalphTurn(
  send: (message: string, options?: { continuationToken?: string }) => Promise<{
    waitForCompletion(): Promise<unknown>;
  }>,
  prompt: string,
  taskId: string,
): Promise<void> {
  const session = await send(prompt, { continuationToken: `autopilot:${taskId}` });
  await session.waitForCompletion();
}

function buildCompactPrompt(task: ConductorTask): string {
  return [
    `You are the attest autopilot conductor for task ${task.taskId}.`,
    `The task state has grown past the prompt budget. Call \`compact_state\` once:`,
    `- summarize the ${task.findings.length} findings into a 2-3 sentence paragraph`,
    `  that preserves every open gap and every validator that is still failing;`,
    `- keep the 5 most recent findings verbatim;`,
    `- use actionId: "compact-${task.iteration}".`,
    `After that one tool call, end the turn. Do nothing else.`,
  ].join("\n");
}
