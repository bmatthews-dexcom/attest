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
  | { ok: true; task: ConductorTask; already?: boolean }
  | { ok: false; reason: "no-task" };

export default defineTool({
  description:
    "Record a finding on a task (validator gap, heal attempt, NEVER-AUTO stop condition, expert escalation). Severity drives whether the loop can continue (soft/gate) or must halt (`halt` findings auto-escalate on the next TS loop check). Idempotent via `actionId`.",
  effect: "write",
  inputSchema: z.object({
    taskId: z.string(),
    source: z.string().describe('e.g. "validate-architecture", "phase_gate_check", "dispatch_expert".'),
    severity: z.enum(["soft", "gate", "halt"]),
    message: z.string(),
    actionId: z.string().describe("Deterministic id for idempotent retry."),
  }),
  async execute(input, ctx): Promise<Result> {
    const key = taskKey(input.taskId);
    const task = (await ctx.host.kv.get(key)) as ConductorTask | undefined;
    if (!task) return { ok: false, reason: "no-task" };

    const dup = alreadyApplied(task, input.actionId);
    if (dup.already) {
      return { ok: true, task, already: true };
    }

    const now = Date.now();
    const finding: ConductorFinding = {
      source: input.source,
      severity: input.severity,
      message: input.message,
      iteration: task.iteration,
      actionId: input.actionId,
      tsMs: now,
    };
    const logEntry: IterationLog = {
      iteration: task.iteration,
      action: "record_finding",
      summary: `[${input.severity}] ${input.source}: ${input.message.slice(0, 160)}`,
      tsMs: now,
    };
    const updated: ConductorTask = recordAction(
      {
        ...task,
        findings: [...task.findings, finding],
        iterationLog: [...task.iterationLog, logEntry],
      },
      input.actionId,
      task.iteration,
    );
    await ctx.host.kv.put(key, updated);
    return { ok: true, task: updated };
  },
});
