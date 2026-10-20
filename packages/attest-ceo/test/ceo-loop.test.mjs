import { test } from "node:test";
import assert from "node:assert/strict";

const { renderCeoLoopPrompt, pickAwaitingPlan } = await import("../bot/lib/ceo-loop.ts");
const { emptyLedger } = await import("../bot/schema.ts");

test("renderCeoLoopPrompt stamps the trigger line + state block", () => {
  const ledger = emptyLedger("2024-05-01T00:00:00.000Z");
  const prompt = renderCeoLoopPrompt({
    ledger,
    trigger: { kind: "chat-command", command: "/ceo" },
  });
  assert.match(prompt, /You are the attest CEO/);
  assert.match(prompt, /Trigger:.*chat command: \/ceo/);
  assert.match(prompt, /Current ledger state/);
  assert.match(prompt, /Awaiting-approval plans \(0\):/);
  assert.match(prompt, /\(none\)/);
  assert.match(prompt, /Decide ONE next step/);
});

test("renderCeoLoopPrompt enumerates awaiting plans up to 5", () => {
  const ledger = emptyLedger();
  for (let i = 0; i < 7; i += 1) {
    ledger.plans.push({
      id: `plan-${i}`,
      version: 1,
      title: `t${i}`,
      rationale: "r",
      commitmentIds: [],
      steps: [],
      approvalState: "awaiting-approval",
      estimatedChiefSessions: 1,
      riskNotes: "",
      createdAt: "2020",
      updatedAt: "2020",
    });
  }
  const prompt = renderCeoLoopPrompt({ ledger, trigger: { kind: "resume" } });
  assert.match(prompt, /Awaiting-approval plans \(7\):/);
  // 5 bullets, not 7
  const bullets = prompt.split("\n").filter((l) => l.startsWith("- plan-"));
  assert.equal(bullets.length, 5);
});

test("pickAwaitingPlan returns the newest awaiting-approval plan", () => {
  const ledger = emptyLedger();
  ledger.plans.push({
    id: "p1",
    version: 1,
    title: "old",
    rationale: "r",
    commitmentIds: [],
    steps: [],
    approvalState: "awaiting-approval",
    estimatedChiefSessions: 1,
    riskNotes: "",
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
  });
  ledger.plans.push({
    id: "p2",
    version: 1,
    title: "new",
    rationale: "r",
    commitmentIds: [],
    steps: [],
    approvalState: "awaiting-approval",
    estimatedChiefSessions: 1,
    riskNotes: "",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  });
  ledger.plans.push({
    id: "p3",
    version: 1,
    title: "approved",
    rationale: "r",
    commitmentIds: [],
    steps: [],
    approvalState: "approved",
    estimatedChiefSessions: 1,
    riskNotes: "",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  });
  const picked = pickAwaitingPlan(ledger);
  assert.equal(picked?.id, "p2");
});

test("pickAwaitingPlan returns undefined on empty ledger", () => {
  assert.equal(pickAwaitingPlan(emptyLedger()), undefined);
});
