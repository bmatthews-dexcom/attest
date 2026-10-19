import { defineTool } from "@cursor/bdk/tools";
import * as z from "zod/v4";
import {
  alreadyApplied,
  recordAction,
  taskKey,
  type ConductorFinding,
  type ConductorTask,
  type IterationLog,
} from "../lib/conductor-state.js";

type Result =
  | { ok: true; task: ConductorTask; droppedFindingCount: number; already?: boolean }
  | { ok: false; reason: "no-task" | "task-ended" };

export default defineTool({
  description:
    "Compact the task state: replace the full findings list with the agent's summary, keep the most recent `keepRecentFindings` entries, and preserve the summary in `scratchpad`. The TS loop calls this when the state exceeds the prompt budget; the agent can also call it voluntarily. Idempotent via `actionId`.",
  effect: "write",
  inputSchema: z.object({
    taskId: z.string(),
    summary: z
      .string()
      .max(4_000)
      .describe(
        "The agent's rewrite of prior findings into a short, factual, decision-ready paragraph. Lives in `scratchpad` after this.",
      ),
    keepRecentFindings: z
      .number()
      .int()
      .min(0)
      .max(50)
      .default(5)
      .describe("How many of the most recent findings to keep verbatim."),
    actionId: z.string().describe("Deterministic id for idempotent retry."),
  }),
  async execute(input, ctx): Promise<Result> {
    const key = taskKey(input.taskId);
    const task = (await ctx.host.kv.get(key)) as ConductorTask | undefined;
    if (!task) return { ok: false, reason: "no-task" };
    if (task.status !== "running") return { ok: false, reason: "task-ended" };

    const dup = alreadyApplied(task, input.actionId);
    if (dup.already) {
      return { ok: true, task, droppedFindingCount: 0, already: true };
    }

    const keep = Math.min(input.keepRecentFindings, task.findings.length);
    const kept: ConductorFinding[] = task.findings.slice(-keep);
    const dropped = task.findings.length - kept.length;

    const now = Date.now();
    const logEntry: IterationLog = {
      iteration: task.iteration,
      action: "compact_state",
      summary: `compacted ${dropped} findings into scratchpad`,
      tsMs: now,
    };
    const updated: ConductorTask = recordAction(
      {
        ...task,
        findings: kept,
        scratchpad: input.summary,
        iterationLog: [...task.iterationLog, logEntry],
      },
      input.actionId,
      task.iteration,
    );
    await ctx.host.kv.put(key, updated);
    return { ok: true, task: updated, droppedFindingCount: dropped };
  },
});
