import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDispatchBlueprint,
  mockTaskStatus,
} from "../dist/dispatch.js";

function makePlan(overrides = {}) {
  return {
    id: "pln-smoke",
    version: 1,
    title: "ship /ceo nudge me command",
    rationale: "r",
    commitmentIds: [],
    steps: [
      {
        id: "pln-smoke-step-1",
        description: "dispatch chief to add the command",
        dispatch: { scope: ".", phaseHint: null, autonomy: "interactive" },
        state: "pending",
        chiefTaskId: null,
      },
      {
        id: "pln-smoke-step-2",
        description: "docs-only coordination",
        dispatch: null,
        state: "pending",
        chiefTaskId: null,
      },
    ],
    approvalState: "approved",
    estimatedChiefSessions: 1,
    riskNotes: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    dispatchMode: "sequenced",
    ...overrides,
  };
}

test("draft-and-approve + approved → one call + one docs-skip", () => {
  const blueprint = buildDispatchBlueprint({
    plan: makePlan(),
    autonomyMode: "draft-and-approve",
  });
  assert.equal(blueprint.calls.length, 1);
  assert.equal(blueprint.calls[0].stepId, "pln-smoke-step-1");
  assert.equal(blueprint.calls[0].scope, ".");
  assert.equal(blueprint.conductorTool, "run_autopilot_task");
  assert.equal(blueprint.skipped.length, 1);
  assert.equal(blueprint.skipped[0].kind, "docs-only-step");
});

test("draft-and-approve + awaiting-approval → short-circuit, no calls", () => {
  const plan = makePlan({ approvalState: "awaiting-approval" });
  const blueprint = buildDispatchBlueprint({
    plan,
    autonomyMode: "draft-and-approve",
  });
  assert.equal(blueprint.calls.length, 0);
  assert.equal(blueprint.skipped[0].kind, "non-approved");
});

test("watch / nudge / draft-only short-circuit even on approved plans", () => {
  for (const mode of ["watch", "nudge", "draft-only"]) {
    const blueprint = buildDispatchBlueprint({
      plan: makePlan(),
      autonomyMode: mode,
    });
    assert.equal(blueprint.calls.length, 0, `mode=${mode}`);
    assert.equal(blueprint.skipped[0].kind, "autonomy-blocks");
  }
});

test("auto-dispatch fires without approval gate", () => {
  const plan = makePlan({ approvalState: "awaiting-approval" });
  const blueprint = buildDispatchBlueprint({
    plan,
    autonomyMode: "auto-dispatch",
  });
  assert.equal(blueprint.calls.length, 1);
  assert.equal(blueprint.autonomy, "auto-dispatch");
});

test("overriding conductorTool mirrors the sibling-contract-escape hatch", () => {
  const blueprint = buildDispatchBlueprint({
    plan: makePlan(),
    autonomyMode: "auto-dispatch",
    conductorTool: "run_chief_task_v2",
  });
  assert.equal(blueprint.conductorTool, "run_chief_task_v2");
});

test("mockTaskStatus has the status.json contract shape", () => {
  const status = mockTaskStatus("task-foo");
  assert.equal(status.taskId, "task-foo");
  assert.ok(["running", "halted", "done", "escalated"].includes(status.status));
  assert.ok(typeof status.updatedAt === "string");
});
