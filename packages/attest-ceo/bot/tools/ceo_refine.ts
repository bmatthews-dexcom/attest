import { defineTool } from "@cursor/bdk/tools";
import * as z from "zod/v4";
import { randomUUID } from "node:crypto";
import { refinePlan } from "attest-ceo-mcp/plan";
import {
  findPlan,
  mutateLedger,
  upsertPlan,
  type Kv,
} from "../lib/ceo-state.js";
import type { Plan } from "../schema.js";

export default defineTool({
  description:
    "/ceo refine <plan-id> — produce a v+1 plan version with revised title + rationale. Original version is preserved.",
  effect: "write",
  inputSchema: z.object({
    planId: z.string().min(1),
    title: z.string().min(1),
    rationale: z.string().min(1),
    actionId: z.string().min(1).default(() => `refine-${randomUUID()}`),
  }),
  async execute(input, ctx) {
    let refined: Plan | null = null;
    const updated = await mutateLedger(ctx.host.kv as Kv, (ledger) => {
      const plan = findPlan(ledger, input.planId);
      if (!plan) return ledger;
      const next = refinePlan(plan, input.title, input.rationale) as unknown as Plan;
      refined = next;
      let out = upsertPlan(ledger, next);
      out.decisions = [
        ...out.decisions,
        {
          id: `dec-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomUUID().slice(0, 6)}`,
          what: "plan_refined",
          when: new Date().toISOString(),
          inputs: {
            planId: input.planId,
            fromVersion: plan.version,
            toVersion: next.version,
            actionId: input.actionId,
          },
          rationale: `Bradford refined ${input.planId} to v${next.version}.`,
          policyEvaluation: null,
        },
      ];
      return out;
    });
    return {
      ok: Boolean(refined),
      planId: input.planId,
      version: refined ? (refined as Plan).version : null,
      ledgerUpdatedAt: updated.updatedAt,
    };
  },
});
