import { test } from "node:test";
import assert from "node:assert/strict";
import { approvePlan, denyPlan, draftPlan, refinePlan } from "../dist/plan.js";

const sampleIntent = {
  id: "int-ep-0",
  summary: "Add /ceo nudge me command for proactive planning reminders.",
  kind: "new-feature",
  confidence: 0.72,
  sourceEpisode: "ep-smoke",
  proposedCommitmentText: "Add /ceo nudge me command for proactive planning reminders.",
  fingerprint: "abcd1234".padEnd(32, "0"),
};

test("draftPlan produces an awaiting-approval plan with at least one dispatch step", () => {
  const plan = draftPlan({ intent: sampleIntent });
  assert.equal(plan.approvalState, "awaiting-approval");
  assert.equal(plan.version, 1);
  assert.ok(plan.steps.length >= 1);
  assert.ok(plan.steps.some((s) => s.dispatch !== null));
  assert.ok(plan.id.startsWith("pln-"));
  assert.equal(plan.commitmentIds.length, 0);
});

test("approvePlan / denyPlan flip state and bump updatedAt", async () => {
  const plan = draftPlan({ intent: sampleIntent });
  const original = plan.updatedAt;
  await new Promise((r) => setTimeout(r, 2));
  const approved = approvePlan(plan);
  assert.equal(approved.approvalState, "approved");
  assert.notEqual(approved.updatedAt, original);
  const denied = denyPlan(plan);
  assert.equal(denied.approvalState, "denied");
});

test("refinePlan bumps version and resets approval", () => {
  const plan = approvePlan(draftPlan({ intent: sampleIntent }));
  const refined = refinePlan(plan, "Refined title", "Refined rationale");
  assert.equal(refined.version, plan.version + 1);
  assert.equal(refined.approvalState, "awaiting-approval");
  assert.equal(refined.title, "Refined title");
});

test("decision/question intents get a docs step", () => {
  const decisionIntent = { ...sampleIntent, kind: "decision" };
  const plan = draftPlan({ intent: decisionIntent });
  const docsStep = plan.steps.find((s) => s.dispatch === null);
  assert.ok(docsStep, "expected at least one docs-only step for a decision intent");
});
