/**
 * ceo-loop.ts — the Ralph-style outer prompt for the CEO.
 *
 * Shorter than the chief's loop: most CEO turns are
 *   ingest → extract → draft plan → surface awaiting-approval.
 * Dispatch only happens on explicit `/ceo approve` (or on
 * `auto-dispatch` autonomy for low-risk plans).
 *
 * This file is a pure template + state renderer. The TypeScript here
 * owns ONLY: load the ledger, render the state, pass the agent the
 * prompt. Decisions live in the agent (via `instructions.md` + the
 * tool palette); state lives in `ctx.host.kv`.
 */

import type { CeoLedger, Plan } from "../schema.js";

export type CeoLoopPromptArgs = {
  ledger: CeoLedger;
  trigger:
    | { kind: "chat-command"; command: string }
    | { kind: "chief-completion"; chiefTaskId: string }
    | { kind: "cron-digest" }
    | { kind: "resume" };
};

export function renderCeoLoopPrompt(args: CeoLoopPromptArgs): string {
  const openCommitments = args.ledger.commitments.filter(
    (c) => c.state === "open" || c.state === "in-flight",
  ).length;
  const awaitingPlans = args.ledger.plans.filter(
    (p) => p.approvalState === "awaiting-approval",
  );
  const inFlightChiefs = args.ledger.tasks.filter(
    (t) => t.lastSeenStatus === "running" || t.lastSeenStatus === "halted" || !t.lastSeenStatus,
  );

  const stateView = {
    autonomy: args.ledger.autonomy,
    openCommitments,
    awaitingPlans: awaitingPlans.length,
    inFlightChiefTasks: inFlightChiefs.length,
    totalDecisions: args.ledger.decisions.length,
    totalDiscussions: args.ledger.discussions.length,
    updatedAt: args.ledger.updatedAt,
  };

  const lines = [
    "You are the attest CEO.",
    `Trigger: ${describeTrigger(args.trigger)}`,
    "",
    "Current ledger state (compact):",
    "```json",
    JSON.stringify(stateView, null, 2),
    "```",
    "",
    `Awaiting-approval plans (${awaitingPlans.length}):`,
    awaitingPlans.length
      ? awaitingPlans
          .slice(0, 5)
          .map((p) => `- ${p.id} v${p.version}: ${p.title}`)
          .join("\n")
      : "(none)",
    "",
    "## Decide ONE next step",
    "",
    "Pick exactly one of:",
    "- `ceo_ingest` — a new discussion needs normalization + intent extraction.",
    "- `ceo_approve` / `ceo_deny` / `ceo_refine` — act on an awaiting plan.",
    "- `ceo_status` / `ceo_roadmap` — surface state to Bradford.",
    "- `ceo_set_autonomy` — Bradford asked to flip modes.",
    "- `run_ceo_turn` — resumption on a chief-completion trigger; reconcile and respond.",
    "",
    "**Idempotency.** Every mutating tool takes `actionId`.",
    "**Do not** dispatch to the chief unless an approved plan is in hand (or autonomy is `auto-dispatch`).",
  ];
  return lines.join("\n");
}

function describeTrigger(t: CeoLoopPromptArgs["trigger"]): string {
  switch (t.kind) {
    case "chat-command":
      return `chat command: ${t.command}`;
    case "chief-completion":
      return `chief task ${t.chiefTaskId} completion`;
    case "cron-digest":
      return "cron digest";
    case "resume":
      return "resume";
  }
}

export function pickAwaitingPlan(ledger: CeoLedger): Plan | undefined {
  return ledger.plans
    .filter((p) => p.approvalState === "awaiting-approval")
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];
}
