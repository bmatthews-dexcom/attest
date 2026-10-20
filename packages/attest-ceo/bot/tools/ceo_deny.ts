import { defineTool } from "@cursor/bdk/tools";
import * as z from "zod/v4";
import { randomUUID } from "node:crypto";
import { denyPlan } from "attest-ceo-mcp/plan";
import {
  findPlan,
  mutateLedger,
  upsertPlan,
  type Kv,
} from "../lib/ceo-state.js";
import type { Plan } from "../schema.js";

export default defineTool({
  description:
    "/ceo deny <plan-id> — mark a plan `denied` without dispatching. Logs a decision entry.",
  effect: "write",
  inputSchema: z.object({
    planId: z.string().min(1),
    actionId: z.string().min(1).default(() => `deny-${randomUUID()}`),
    reason: z.string().optional(),
  }),
  async execute(input, ctx) {
    const updated = await mutateLedger(ctx.host.kv as Kv, (ledger) => {
      const plan = findPlan(ledger, input.planId);
      if (!plan) return ledger;
      const next = denyPlan(plan) as unknown as Plan;
      let out = upsertPlan(ledger, next);
      out.decisions = [
        ...out.decisions,
        {
          id: `dec-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomUUID().slice(0, 6)}`,
          what: "plan_denied",
          when: new Date().toISOString(),
          inputs: {
            planId: input.planId,
            version: next.version,
            reason: input.reason ?? null,
            actionId: input.actionId,
          },
          rationale: input.reason ?? "Bradford denied the plan without a stated reason.",
          policyEvaluation: null,
        },
      ];
      return out;
    });
    const plan = findPlan(updated, input.planId);
    return {
      ok: Boolean(plan),
      planId: input.planId,
      approvalState: plan?.approvalState ?? "unknown",
    };
  },
});
