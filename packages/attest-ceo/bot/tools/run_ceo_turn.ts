import { defineTool, type ToolContext } from "@cursor/bdk/tools";
import * as z from "zod/v4";
import { renderCeoLoopPrompt } from "../lib/ceo-loop.js";
import {
  mutateLedger,
  readLedger,
  upsertTaskRef,
  type Kv,
} from "../lib/ceo-state.js";
import type { ChiefTaskCompletion, Plan, PlanStep } from "../schema.js";

type ReconcileCompletionCtx = ToolContext & {
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

/**
 * The CEO's Ralph driver.
 *
 * Called when:
 *  - Bradford types a `/ceo` command that doesn't short-circuit to a
 *    specific tool (e.g. `/ceo` on its own, or `/ceo digest`);
 *  - a chief task posts a completion notification;
 *  - the resume path fires on serve restart;
 *  - the cron digest fires (Phase 3 — placeholder here).
 *
 * The loop body is deliberately shorter than the chief's: load the
 * ledger, reconcile any closed chief tasks, render the prompt, hand the
 * agent one next action. The outer agent LLM decides which tool to
 * fire; we just prepare the state view.
 */
export default defineTool({
  description:
    "Internal CEO Ralph turn: load ledger, reconcile closed chief tasks, render the next-step prompt, return it for the agent to act on. Not a chat entry; `/ceo` chat routing calls into the specific sub-command tools directly.",
  effect: "write",
  inputSchema: z.object({
    trigger: z.enum(["chat-command", "chief-completion", "cron-digest", "resume"]).default("resume"),
    command: z.string().optional(),
    chiefTaskId: z.string().optional(),
    conductorMcpServer: z.string().default("attest"),
  }),
  async execute(input, ctx) {
    const kv = ctx.host.kv as Kv;

    // 1. Reconcile any closed chief tasks we know about.
    const reconciliation = await reconcileCompletions(
      ctx as ReconcileCompletionCtx,
      kv,
      input.conductorMcpServer,
    );

    // 2. Render the next-step prompt.
    const ledger = await readLedger(kv);
    const trigger =
      input.trigger === "chat-command"
        ? { kind: "chat-command" as const, command: input.command ?? "/ceo" }
        : input.trigger === "chief-completion"
          ? { kind: "chief-completion" as const, chiefTaskId: input.chiefTaskId ?? "unknown" }
          : input.trigger === "cron-digest"
            ? { kind: "cron-digest" as const }
            : { kind: "resume" as const };
    const prompt = renderCeoLoopPrompt({ ledger, trigger });

    return {
      ok: true,
      trigger: input.trigger,
      reconciliation,
      ledgerUpdatedAt: ledger.updatedAt,
      prompt,
    };
  },
});

async function reconcileCompletions(
  ctx: ReconcileCompletionCtx,
  kv: Kv,
  attestMcpServer: string,
) {
  const ledger = await readLedger(kv);
  const inFlight = ledger.tasks.filter(
    (t) => !t.completedAt && (t.lastSeenStatus === "running" || t.lastSeenStatus === "halted" || !t.lastSeenStatus),
  );
  const resolved: Array<{
    chiefTaskId: string;
    planId: string;
    status: string;
    reason: string;
  }> = [];
  for (const task of inFlight) {
    let completion: ChiefTaskCompletion | null = null;
    try {
      // TODO(ceo): switch to the real resource read when attest-mcp
      // Shape C merges `attest://tasks/<id>/completion.json`.
      const result = (await ctx.host.mcp.callTool(
        attestMcpServer,
        "read_task_completion",
        { taskId: task.chiefTaskId },
      )) as unknown;
      completion = parseCompletion(result);
    } catch (err) {
      // Non-fatal; try again next turn.
      void err;
    }
    if (!completion) continue;
    resolved.push({
      chiefTaskId: completion.taskId,
      planId: task.planId,
      status: completion.status,
      reason: completion.endReason,
    });
    await mutateLedger(kv, (current) => {
      let next = upsertTaskRef(current, {
        ...task,
        lastSeenStatus: completion!.status === "done" ? "done" : "escalated",
        completedAt: completion!.closedAt,
      });
      // Mark the plan step done; if all steps done, mark the plan complete.
      next = {
        ...next,
        plans: next.plans.map((p) => {
          if (p.id !== task.planId) return p;
          const steps: PlanStep[] = p.steps.map((s) =>
            s.id === task.stepId
              ? { ...s, state: completion!.status === "done" ? "done" : "failed" }
              : s,
          );
          const allDone = steps.every((s) => s.state === "done" || s.dispatch === null);
          const nextPlan: Plan = {
            ...p,
            steps,
            approvalState: allDone ? "complete" : "in-flight",
            updatedAt: new Date().toISOString(),
          };
          return nextPlan;
        }),
      };
      return next;
    });
  }
  return { resolved, inFlightScanned: inFlight.length };
}

function parseCompletion(raw: unknown): ChiefTaskCompletion | null {
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
          return null;
        }
      }
    }
  }
  if (
    payload &&
    typeof payload === "object" &&
    "present" in payload &&
    (payload as { present?: boolean }).present === false
  ) {
    return null;
  }
  if (
    payload &&
    typeof payload === "object" &&
    "taskId" in payload &&
    "status" in payload &&
    "closedAt" in payload
  ) {
    return payload as ChiefTaskCompletion;
  }
  return null;
}
