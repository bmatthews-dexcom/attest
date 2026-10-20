import { defineTool, type ToolExecuteResult } from "@cursor/bdk/tools";
import * as z from "zod/v4";
import {
  alreadyApplied,
  recordAction,
  taskKey,
  type ConductorFinding,
  type ConductorTask,
  type ExpertVisit,
  type IterationLog,
} from "../lib/conductor-state.js";
import {
  callInvokeExpert,
  InvokeExpertParseError,
  type InvokeExpertOutcome,
  type McpCallable,
} from "../lib/invoke-expert.js";

export type InvokeResult = {
  expertId: string;
  outcome: InvokeExpertOutcome["kind"] | "parse_error" | "mcp_error";
  summary: string;
  /**
   * Full `ExpertOutput` body when `outcome === "expert_output"`. Typed as
   * JsonValue-compatible so the tool framework can serialize it; the server
   * expert returns JSON-shaped reports per the attest-mcp contract.
   */
  result?: unknown;
  /** `PolicyDenied` fields. */
  policy?: { reason: string; capability?: string; ruleId?: string };
  /** `ApprovalRequired` fields — the Ralph loop uses these to call `request_approval`. */
  approvalRequired?: {
    capability: string;
    approver: string;
    prompt: string;
    destructiveOp?: string;
    target?: string;
  };
  /** Approval id the agent passed in on retry, if any. */
  approvalId?: string;
  taskPersisted: boolean;
  already?: boolean;
};

export default defineTool({
  description:
    "Shape-C expert invocation. Calls attest-mcp's `invoke_expert` which evaluates the policy, routes to the in-process handler OR the sandbox BDK expert, and returns one of three outcomes: `expert_output` (feed to Ralph), `policy_denied` (surface + escalate / route differently), `approval_required` (call `request_approval`, then retry with `approvalId`). Replaces the Shape-A `dispatch_expert` transport switch — attest-mcp owns that now. Idempotent via `actionId`.",
  effect: "write",
  inputSchema: z.object({
    taskId: z.string(),
    expertId: z
      .string()
      .min(1)
      .describe("Expert id as surfaced by attest-mcp's `list_experts` (or `route_goal.expert`)."),
    prompt: z
      .string()
      .min(1)
      .describe("Full prompt for the expert — goal + HANDOFF-shaped scope."),
    input: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Structured input the expert may read (scope globs, acceptance predicate, prior findings)."),
    approvalId: z
      .string()
      .optional()
      .describe("When retrying after `request_approval` resolved: the approval id so the policy engine can attach the ack."),
    actionId: z.string().describe("Deterministic id for idempotent retry."),
  }),
  async execute(input, ctx): Promise<ToolExecuteResult> {
    const result = await executeInvoke(input, ctx);
    return result as unknown as ToolExecuteResult;
  },
});

async function executeInvoke(
  input: {
    taskId: string;
    expertId: string;
    prompt: string;
    input?: Record<string, unknown>;
    approvalId?: string;
    actionId: string;
  },
  ctx: {
    host: {
      kv: {
        get(key: string): Promise<unknown>;
        put(key: string, value: unknown): Promise<void>;
      };
      mcp: {
        callTool(
          server: string,
          tool: string,
          args?: Record<string, unknown>,
        ): Promise<unknown>;
      };
    };
  },
): Promise<InvokeResult> {
    const key = taskKey(input.taskId);
    const task = (await ctx.host.kv.get(key)) as ConductorTask | undefined;
    if (!task) {
      return {
        expertId: input.expertId,
        outcome: "mcp_error",
        summary: `no task ${input.taskId}`,
        taskPersisted: false,
      };
    }

    const dup = alreadyApplied(task, input.actionId);
    if (dup.already) {
      const prior = task.visitedExperts.find((v) => v.actionId === input.actionId);
      if (prior) {
        return {
          expertId: prior.expertId,
          outcome: "expert_output",
          summary: prior.summary,
          taskPersisted: true,
          already: true,
        };
      }
    }

    let outcome: InvokeExpertOutcome | null = null;
    let errMessage: string | null = null;
    let parseError = false;
    try {
      outcome = await callInvokeExpert(ctx as unknown as McpCallable, {
        expertId: input.expertId,
        taskId: input.taskId,
        phase: task.currentPhase,
        prompt: input.prompt,
        input: input.input,
        approvalId: input.approvalId,
      });
    } catch (err) {
      errMessage = err instanceof Error ? err.message : String(err);
      parseError = err instanceof InvokeExpertParseError;
    }

    const result = toResult({
      expertId: input.expertId,
      outcome,
      errMessage,
      parseError,
      approvalId: input.approvalId,
    });

    // Mutate task state based on outcome. All three outcomes advance the
    // iteration and either reset or bump the no-progress counter — the
    // Ralph loop treats each as a bona-fide step.
    const now = Date.now();
    const summaryForLog = `${input.expertId} ${result.outcome}: ${result.summary.slice(0, 160)}`;
    const logEntry: IterationLog = {
      iteration: task.iteration,
      action: "invoke_expert",
      summary: summaryForLog,
      tsMs: now,
    };

    const visit: ExpertVisit = {
      iteration: task.iteration,
      expertId: input.expertId,
      prompt: input.prompt,
      summary: result.summary,
      status: outcomeToVisitStatus(result.outcome),
      actionId: input.actionId,
      tsMs: now,
    };

    const findings: ConductorFinding[] = [];
    if (result.outcome === "policy_denied") {
      findings.push({
        source: "invoke_expert",
        severity: "gate",
        message: `policy denied ${input.expertId}: ${result.policy?.reason ?? ""}`,
        iteration: task.iteration,
        actionId: input.actionId,
        tsMs: now,
      });
    } else if (result.outcome === "approval_required") {
      findings.push({
        source: "invoke_expert",
        severity: "soft",
        message: `approval required for ${input.expertId} (${result.approvalRequired?.capability ?? "?"})`,
        iteration: task.iteration,
        actionId: input.actionId,
        tsMs: now,
      });
    } else if (result.outcome === "mcp_error" || result.outcome === "parse_error") {
      findings.push({
        source: "invoke_expert",
        severity: "gate",
        message: result.summary,
        iteration: task.iteration,
        actionId: input.actionId,
        tsMs: now,
      });
    }

    const nextIteration = task.iteration + 1;
    const makesProgress = result.outcome === "expert_output";
    const consecutiveNoProgress = makesProgress ? 0 : task.consecutiveNoProgress + 1;

    const updated: ConductorTask = recordAction(
      {
        ...task,
        iteration: nextIteration,
        consecutiveNoProgress,
        visitedExperts: [...task.visitedExperts, visit],
        iterationLog: [...task.iterationLog, logEntry],
        findings: findings.length ? [...task.findings, ...findings] : task.findings,
        lastSummary: result.summary,
      },
      input.actionId,
      nextIteration,
    );
    await ctx.host.kv.put(key, updated);
    result.taskPersisted = true;
    return result;
}

function toResult(args: {
  expertId: string;
  outcome: InvokeExpertOutcome | null;
  errMessage: string | null;
  parseError: boolean;
  approvalId?: string;
}): InvokeResult {
  if (args.outcome) {
    const o = args.outcome;
    switch (o.kind) {
      case "expert_output":
        return {
          expertId: args.expertId,
          outcome: "expert_output",
          summary: o.summary,
          result: o.result,
          approvalId: args.approvalId,
          taskPersisted: false,
        };
      case "policy_denied":
        return {
          expertId: args.expertId,
          outcome: "policy_denied",
          summary: `policy denied: ${o.reason}`,
          policy: {
            reason: o.reason,
            capability: o.capability,
            ruleId: o.ruleId,
          },
          approvalId: args.approvalId,
          taskPersisted: false,
        };
      case "approval_required":
        return {
          expertId: args.expertId,
          outcome: "approval_required",
          summary: `approval required: ${o.capability} (${o.prompt.slice(0, 80)})`,
          approvalRequired: {
            capability: o.capability,
            approver: o.approver,
            prompt: o.prompt,
            destructiveOp: o.destructiveOp,
            target: o.target,
          },
          approvalId: args.approvalId,
          taskPersisted: false,
        };
    }
  }
  if (args.parseError) {
    return {
      expertId: args.expertId,
      outcome: "parse_error",
      summary: `invoke_expert contract mismatch with attest-mcp: ${args.errMessage ?? "unknown"}`,
      approvalId: args.approvalId,
      taskPersisted: false,
    };
  }
  return {
    expertId: args.expertId,
    outcome: "mcp_error",
    summary: `invoke_expert call failed: ${args.errMessage ?? "unknown"}`,
    approvalId: args.approvalId,
    taskPersisted: false,
  };
}

function outcomeToVisitStatus(outcome: InvokeResult["outcome"]): ExpertVisit["status"] {
  if (outcome === "expert_output") return "ok";
  if (outcome === "approval_required") return "escalated";
  return "failed";
}
