import { defineTool } from "@cursor/bdk/tools";
import * as z from "zod/v4";
import { readLedger, type Kv } from "../lib/ceo-state.js";
import type { CeoLedger } from "../schema.js";

export default defineTool({
  description:
    "/ceo status — summarize open commitments, in-flight chief tasks, awaiting plans, and the current autonomy mode.",
  effect: "read",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const ledger = await readLedger(ctx.host.kv as Kv);
    return summarize(ledger);
  },
});

export function summarize(ledger: CeoLedger) {
  const open = ledger.commitments.filter(
    (c) => c.state === "open" || c.state === "in-flight",
  );
  const inFlight = ledger.tasks.filter(
    (t) => t.lastSeenStatus === "running" || t.lastSeenStatus === "halted" || !t.completedAt,
  );
  const awaiting = ledger.plans.filter(
    (p) => p.approvalState === "awaiting-approval",
  );
  return {
    autonomy: ledger.autonomy,
    counts: {
      openCommitments: open.length,
      inFlightChiefTasks: inFlight.length,
      awaitingPlans: awaiting.length,
      totalDecisions: ledger.decisions.length,
      totalDiscussions: ledger.discussions.length,
    },
    openCommitments: open.map((c) => ({
      id: c.id,
      state: c.state,
      text: c.text.slice(0, 160),
      priorityBand: c.priorityBand ?? null,
    })),
    awaitingPlans: awaiting.slice(0, 10).map((p) => ({
      id: p.id,
      version: p.version,
      title: p.title,
      estimatedChiefSessions: p.estimatedChiefSessions,
    })),
    inFlightChiefTasks: inFlight.map((t) => ({
      chiefTaskId: t.chiefTaskId,
      planId: t.planId,
      stepId: t.stepId,
      lastSeenStatus: t.lastSeenStatus ?? "unknown",
    })),
    ledgerUpdatedAt: ledger.updatedAt,
  };
}
