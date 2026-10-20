import { defineTool } from "@cursor/bdk/tools";
import * as z from "zod/v4";
import { taskKey, type ConductorTask } from "../lib/conductor-state.js";
import {
  callPreDispatchCheck,
  InvokeExpertParseError,
  type McpCallable,
  type PreDispatchDecision,
} from "../lib/invoke-expert.js";

type Result = {
  decision: "allow" | "deny" | "requires-approval";
  reason?: string;
  capability?: string;
  ruleId?: string;
  expertId: string;
  phase?: string;
  taskPresent: boolean;
};

export default defineTool({
  description:
    "Shape-C policy preview: ask attest-mcp's `pre_dispatch_check` whether invoking an expert in the current phase would be allowed, denied, or require approval — without paying the dispatch cost. Use this BEFORE `invoke_expert` when the next action is a dispatch that may require approval; if the response is `requires-approval`, call `request_approval` first and then re-attempt dispatch with the resolved approval id.",
  effect: "read",
  inputSchema: z.object({
    taskId: z.string(),
    expertId: z.string().min(1),
    scope: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Optional capability scope (e.g. { writes: ['src/**'], shell_patterns: [...] })."),
  }),
  async execute(input, ctx): Promise<Result> {
    const key = taskKey(input.taskId);
    const task = (await ctx.host.kv.get(key)) as ConductorTask | undefined;
    const phase = task?.currentPhase;
    try {
      const decision: PreDispatchDecision = await callPreDispatchCheck(
        ctx as unknown as McpCallable,
        {
          expertId: input.expertId,
          taskId: input.taskId,
          phase,
          scope: input.scope,
        },
      );
      return {
        decision: decision.decision,
        reason: decision.reason,
        capability: decision.capability,
        ruleId: decision.ruleId,
        expertId: input.expertId,
        phase,
        taskPresent: Boolean(task),
      };
    } catch (err) {
      if (err instanceof InvokeExpertParseError) {
        return {
          decision: "deny",
          reason: `pre_dispatch_check contract mismatch with attest-mcp: ${err.message}`,
          expertId: input.expertId,
          phase,
          taskPresent: Boolean(task),
        };
      }
      const message = err instanceof Error ? err.message : String(err);
      return {
        decision: "deny",
        reason: `pre_dispatch_check call failed: ${message}`,
        expertId: input.expertId,
        phase,
        taskPresent: Boolean(task),
      };
    }
  },
});
