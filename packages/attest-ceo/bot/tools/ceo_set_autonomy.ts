import { defineTool } from "@cursor/bdk/tools";
import * as z from "zod/v4";
import {
  mutateLedger,
  setAutonomy,
  type Kv,
} from "../lib/ceo-state.js";
import { autonomyModeSchema } from "../schema.js";
import { randomUUID } from "node:crypto";

export default defineTool({
  description:
    "/ceo set-autonomy <mode> — set the CEO autonomy mode (watch | nudge | draft-only | draft-and-approve | auto-dispatch). Logs a decision entry.",
  effect: "write",
  inputSchema: z.object({
    mode: autonomyModeSchema,
    actionId: z.string().min(1).default(() => `set-autonomy-${randomUUID()}`),
  }),
  async execute(input, ctx) {
    const updated = await mutateLedger(ctx.host.kv as Kv, (ledger) => {
      const next = setAutonomy(ledger, input.mode);
      next.decisions = [
        ...next.decisions,
        {
          id: `dec-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomUUID().slice(0, 6)}`,
          what: "autonomy_mode_change",
          when: new Date().toISOString(),
          inputs: { previousMode: ledger.autonomy, newMode: input.mode, actionId: input.actionId },
          rationale: `CEO autonomy mode flipped from ${ledger.autonomy} to ${input.mode}.`,
          policyEvaluation: null,
        },
      ];
      return next;
    });
    return {
      ok: true,
      autonomy: updated.autonomy,
      decisionCount: updated.decisions.length,
    };
  },
});
