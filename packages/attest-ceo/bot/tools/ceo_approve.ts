import { defineTool, type ToolContext } from "@cursor/bdk/tools";
import * as z from "zod/v4";
import { randomUUID } from "node:crypto";
import { approvePlan } from "attest-ceo-mcp/plan";
import {
  buildDispatchBlueprint,
  type DispatchBlueprint,
  type DispatchCall,
} from "attest-ceo-mcp/dispatch";
import {
  findPlan,
  mutateLedger,
  upsertPlan,
  upsertTaskRef,
  type Kv,
} from "../lib/ceo-state.js";
import type { Plan, PlanStep } from "../schema.js";

type DispatchResult = {
  planId: string;
  dispatchedSteps: Array<{
    stepId: string;
    chiefTaskId: string;
    conductorTool: string;
  }>;
  skipped: DispatchBlueprint["skipped"];
  mode: DispatchBlueprint["mode"];
};

type ConductorCallable = {
  host: {
    mcp: {
      callTool: (
        server: string,
        tool: string,
        input?: Record<string, unknown>,
      ) => Promise<unknown>;
    };
  };
};

export default defineTool({
  description:
    "/ceo approve <plan-id> — approve a plan. If autonomy allows, build the dispatch blueprint and fire each chief task via the attest-conductor MCP connection. Each dispatched step gets a TaskRef recorded in the ledger for later reconciliation.",
  effect: "write",
  inputSchema: z.object({
    planId: z.string().min(1),
    actionId: z.string().min(1).default(() => `approve-${randomUUID()}`),
    conductorServer: z.string().default("attest-conductor"),
    conductorTool: z.string().optional(),
  }),
  async execute(input, ctx) {
    const kv = ctx.host.kv as Kv;

    // 1. Load, approve, persist. Build dispatch blueprint from the approved plan.
    let approvedPlan: Plan | null = null;
    let autonomy: Plan["approvalState"] extends never ? never : import("../schema.js").AutonomyMode;
    const ledgerAfterApprove = await mutateLedger(kv, (ledger) => {
      const plan = findPlan(ledger, input.planId);
      if (!plan) return ledger;
      if (plan.approvalState === "approved" || plan.approvalState === "in-flight") {
        approvedPlan = plan;
        autonomy = ledger.autonomy as never;
        return ledger;
      }
      const next = approvePlan(plan) as unknown as Plan;
      approvedPlan = next;
      autonomy = ledger.autonomy as never;
      ledger = upsertPlan(ledger, next);
      ledger.decisions = [
        ...ledger.decisions,
        {
          id: `dec-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomUUID().slice(0, 6)}`,
          what: "plan_approved",
          when: new Date().toISOString(),
          inputs: { planId: input.planId, version: next.version, actionId: input.actionId },
          rationale: `Bradford approved ${input.planId} v${next.version}.`,
          policyEvaluation: null,
        },
      ];
      return ledger;
    });

    if (!approvedPlan) {
      return {
        ok: false,
        error: `plan ${input.planId} not found`,
        ledgerUpdatedAt: ledgerAfterApprove.updatedAt,
      };
    }

    const plan = approvedPlan as Plan;
    const blueprint = buildDispatchBlueprint({
      plan,
      autonomyMode: ledgerAfterApprove.autonomy,
      conductorTool: input.conductorTool,
    });

    // 2. Fire each dispatchable step through the conductor connection.
    const dispatched: DispatchResult["dispatchedSteps"] = [];
    for (const call of blueprint.calls) {
      const chiefTaskId = await callConductor(
        ctx,
        input.conductorServer,
        blueprint.conductorTool,
        call,
      );
      dispatched.push({
        stepId: call.stepId,
        chiefTaskId,
        conductorTool: blueprint.conductorTool,
      });
      // Persist the chief task ref immediately so a crash mid-batch
      // doesn't lose the dispatch handle.
      await mutateLedger(kv, (ledger) => {
        let next = ledger;
        const step: PlanStep | undefined = plan.steps.find((s) => s.id === call.stepId);
        if (step) {
          const updatedStep: PlanStep = {
            ...step,
            state: "in-flight",
            chiefTaskId,
          };
          const planNext: Plan = {
            ...plan,
            steps: plan.steps.map((s) => (s.id === step.id ? updatedStep : s)),
            approvalState: "in-flight",
            updatedAt: new Date().toISOString(),
          };
          next = upsertPlan(next, planNext);
        }
        next = upsertTaskRef(next, {
          chiefTaskId,
          planId: plan.id,
          stepId: call.stepId,
          dispatchedAt: new Date().toISOString(),
          lastSeenStatus: "running",
          completedAt: null,
        });
        return next;
      });
    }

    return {
      ok: true,
      planId: plan.id,
      planVersion: plan.version,
      autonomy: ledgerAfterApprove.autonomy,
      dispatchedSteps: dispatched,
      skipped: blueprint.skipped,
      mode: blueprint.mode,
    } satisfies DispatchResult & { ok: true; planVersion: number; autonomy: string };
  },
});

async function callConductor(
  ctx: ToolContext,
  server: string,
  tool: string,
  call: DispatchCall,
): Promise<string> {
  const mcpCtx = ctx as unknown as ConductorCallable;
  try {
    const result = (await mcpCtx.host.mcp.callTool(server, tool, {
      goal: call.input.goal,
      iterationCap: call.input.iterationCap,
      wallTimeCapMs: call.input.wallTimeCapMs,
      maxTurns: call.input.maxTurns,
    })) as unknown;
    const taskId = extractTaskId(result);
    if (taskId) return taskId;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return `task_failed_${call.stepId}_${message.slice(0, 24)}`;
  }
  return `task_unknown_${call.stepId}`;
}

function extractTaskId(raw: unknown): string | null {
  // MCP SDK: { content: [{ type: "text", text: "<json>" }] } OR direct object.
  let payload: unknown = raw;
  if (payload && typeof payload === "object" && "content" in payload) {
    const content = (payload as { content?: unknown }).content;
    if (
      Array.isArray(content) &&
      content.length > 0 &&
      typeof content[0] === "object" &&
      content[0] !== null &&
      "text" in content[0]
    ) {
      const text = (content[0] as { text?: string }).text;
      if (typeof text === "string") {
        try {
          payload = JSON.parse(text);
        } catch {
          // leave as-is
        }
      }
    }
  }
  if (payload && typeof payload === "object" && "taskId" in payload) {
    const t = (payload as { taskId?: unknown }).taskId;
    if (typeof t === "string") return t;
  }
  return null;
}
