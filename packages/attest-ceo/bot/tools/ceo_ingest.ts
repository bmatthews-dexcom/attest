import { defineTool } from "@cursor/bdk/tools";
import * as z from "zod/v4";
import { randomUUID } from "node:crypto";
import { ingestDiscussion } from "@bpmforge/attest-ceo-mcp/discussions";
import { draftPlan } from "@bpmforge/attest-ceo-mcp/plan";
import {
  appendDiscussion,
  findDuplicateCommitment,
  mutateLedger,
  upsertCommitment,
  upsertPlan,
  type Kv,
} from "../lib/ceo-state.js";
import {
  discussionSourceSchema,
  type Commitment,
  type Intent,
  type Plan,
} from "../schema.js";

const DEFAULT_PLAN_CONFIDENCE_FLOOR = 0.55;

export default defineTool({
  description:
    "/ceo ingest — normalize a discussion, extract intents, dedup against open commitments, and (if the top intent crosses the confidence floor) draft a plan. Does not dispatch.",
  effect: "write",
  inputSchema: z.object({
    text: z.string().min(1),
    source: discussionSourceSchema.default({
      channel: "cursor-chat",
    }),
    actionId: z.string().min(1).default(() => `ingest-${randomUUID()}`),
    planConfidenceFloor: z
      .number()
      .min(0)
      .max(1)
      .default(DEFAULT_PLAN_CONFIDENCE_FLOOR),
  }),
  async execute(input, ctx) {
    const now = new Date().toISOString();
    const ingested = ingestDiscussion({
      source: input.source,
      text: input.text,
    });

    const createdCommitments: Commitment[] = [];
    const mergedWith: Array<{ commitmentId: string; intentId: string }> = [];
    let draftedPlan: Plan | null = null;

    const updated = await mutateLedger(ctx.host.kv as Kv, (ledger) => {
      let next = appendDiscussion(ledger, ingested.digest);
      for (const intent of ingested.intents as Intent[]) {
        const existing = findDuplicateCommitment(next, intent.fingerprint);
        if (existing) {
          const merged: Commitment = {
            ...existing,
            evidence: [...existing.evidence, ingested.digest.id],
            updatedAt: now,
          };
          next = upsertCommitment(next, merged);
          mergedWith.push({ commitmentId: existing.id, intentId: intent.id });
          continue;
        }
        const commitment: Commitment = {
          id: `cmt-${now.slice(0, 10).replace(/-/g, "")}-${randomUUID().slice(0, 6)}`,
          text: intent.proposedCommitmentText,
          state: "open",
          source: input.source,
          evidence: [ingested.digest.id],
          dedupeFingerprint: intent.fingerprint,
          createdAt: now,
          updatedAt: now,
          dependencyIds: [],
          chiefTaskIds: [],
        };
        next = upsertCommitment(next, commitment);
        createdCommitments.push(commitment);
      }

      const topIntent = (ingested.intents as Intent[]).sort(
        (a, b) => b.confidence - a.confidence,
      )[0];
      if (topIntent && topIntent.confidence >= input.planConfidenceFloor) {
        const scopeHint =
          input.source.channel === "cursor-chat" ? "docs/work/" : ".";
        const plan = draftPlan({
          intent: topIntent,
          context: {
            commitments: createdCommitments,
            scopeHint,
          },
        }) as unknown as Plan;
        next = upsertPlan(next, plan);
        draftedPlan = plan;
      }

      next.decisions = [
        ...next.decisions,
        {
          id: `dec-${now.slice(0, 10).replace(/-/g, "")}-${randomUUID().slice(0, 6)}`,
          what: "ingested_discussion",
          when: now,
          inputs: {
            discussionId: ingested.digest.id,
            intents: ingested.intents.length,
            createdCommitments: createdCommitments.length,
            mergedWith: mergedWith.length,
            planId: draftedPlan ? (draftedPlan as Plan).id : null,
            actionId: input.actionId,
          },
          rationale: `Ingested ${ingested.intents.length} intents from ${input.source.channel}.`,
          policyEvaluation: null,
          confidence: null,
        },
      ];
      return next;
    });

    return {
      ok: true,
      discussionId: ingested.digest.id,
      intents: ingested.intents,
      createdCommitments: createdCommitments.map((c) => ({ id: c.id, text: c.text.slice(0, 160) })),
      mergedWith,
      draftedPlan: draftedPlan
        ? {
            id: (draftedPlan as Plan).id,
            version: (draftedPlan as Plan).version,
            title: (draftedPlan as Plan).title,
            approvalState: (draftedPlan as Plan).approvalState,
          }
        : null,
      ledgerUpdatedAt: updated.updatedAt,
    };
  },
});
