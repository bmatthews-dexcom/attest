import { test } from "node:test";
import assert from "node:assert/strict";

const { newTask } = await import("../bot/lib/conductor-state.ts");
const {
  renderRalphPrompt,
  shouldStop,
  needsCompaction,
  approxStateSize,
  validatorScriptToToolName,
  DEFAULT_SCRATCHPAD_COMPACT_THRESHOLD,
} = await import("../bot/lib/ralph-loop.ts");

function liveTask(overrides = {}) {
  const base = newTask({ goal: "harden the login flow" });
  return { ...base, ...overrides };
}

test("renderRalphPrompt carries Shape-C palette (invoke_expert, pre_dispatch_check, request_approval, set_autonomy_mode)", () => {
  const task = liveTask({ iteration: 2, currentPhase: "verify" });
  const prompt = renderRalphPrompt({ task });
  assert.ok(prompt.includes(task.taskId));
  assert.ok(prompt.includes("harden the login flow"));
  assert.ok(prompt.includes('"currentPhase": "verify"'));
  assert.ok(prompt.includes("invoke_expert"));
  assert.ok(prompt.includes("pre_dispatch_check"));
  assert.ok(prompt.includes("request_approval"));
  assert.ok(prompt.includes("set_autonomy_mode"));
  assert.ok(prompt.includes("mark_done"));
  assert.ok(prompt.includes("escalate"));
  assert.ok(prompt.includes("Decide and perform the single next step"));
  assert.ok(prompt.includes("phase_gate_check"));
  assert.ok(prompt.includes("plannedValidators"));
  assert.ok(prompt.includes("validate_<name>"));
  assert.ok(
    /do not.*write imperative branches/i.test(prompt),
    "prompt must warn against imperative branches",
  );
  // Shape-C: dispatch flow guidance.
  assert.ok(
    /pre_dispatch_check\s*→.*request_approval\s*→.*invoke_expert/i.test(prompt) ||
      /Before dispatching to an expert that may need approval/.test(prompt),
    "prompt must guide the pre_dispatch_check → request_approval → invoke_expert sequence",
  );
  assert.ok(/never retry blindly/i.test(prompt));
});

test("renderRalphPrompt surfaces autonomy mode in the state view and header", () => {
  const task = liveTask({ autonomyMode: "approve-destructive" });
  const prompt = renderRalphPrompt({ task });
  assert.ok(/Autonomy mode: approve-destructive/.test(prompt));
  assert.ok(/"autonomyMode": "approve-destructive"/.test(prompt));
});

test("renderRalphPrompt advertises invoke_expert's three outcomes", () => {
  const task = liveTask();
  const prompt = renderRalphPrompt({ task });
  assert.ok(/expert_output/.test(prompt));
  assert.ok(/policy_denied/.test(prompt));
  assert.ok(/approval_required/.test(prompt));
});

test("renderRalphPrompt annotates pre-fetched validators with their MCP tool name", () => {
  const task = liveTask();
  const prompt = renderRalphPrompt({
    task,
    phaseValidators: ["validate-architecture.sh", "validate-auth.sh"],
  });
  assert.ok(prompt.includes("validate-architecture.sh"));
  assert.ok(prompt.includes("`validate_architecture`"));
  assert.ok(prompt.includes("`validate_auth`"));
});

test("validatorScriptToToolName mirrors attest-mcp's toolNameForValidator", () => {
  assert.equal(validatorScriptToToolName("validate-architecture.sh"), "validate_architecture");
  assert.equal(
    validatorScriptToToolName("validate-handoff-discipline.sh"),
    "validate_handoff_discipline",
  );
  assert.equal(
    validatorScriptToToolName("validate-no-ascii-art.sh"),
    "validate_no_ascii_art",
  );
  assert.equal(validatorScriptToToolName("validate_architecture"), "validate_architecture");
});

test("renderRalphPrompt stays stable across iterations when only state changes", () => {
  const taskA = liveTask({ iteration: 1 });
  const taskB = { ...taskA, iteration: 2 };
  const promptA = renderRalphPrompt({ task: taskA });
  const promptB = renderRalphPrompt({ task: taskB });
  // Headers / tool palette identical.
  const headerA = promptA.split("Current state")[0];
  const headerB = promptB.split("Current state")[0];
  assert.equal(headerA, headerB);
  const paletteA = promptA.split("## Decide")[1];
  const paletteB = promptB.split("## Decide")[1];
  assert.equal(paletteA, paletteB);
});

test("shouldStop returns null for a fresh running task", () => {
  assert.equal(shouldStop(liveTask()), null);
});

test("shouldStop fires on iteration cap", () => {
  const stop = shouldStop(liveTask({ iteration: 10, iterationCap: 10 }));
  assert.deepEqual(stop, { kind: "iteration-cap", cap: 10 });
});

test("shouldStop fires on consecutive no-progress cap", () => {
  const stop = shouldStop(
    liveTask({ consecutiveNoProgress: 3, consecutiveNoProgressCap: 3 }),
  );
  assert.deepEqual(stop, { kind: "consecutive-no-progress", cap: 3 });
});

test("shouldStop fires on wall-time cap", () => {
  const task = liveTask({ startedAtMs: 1_000, wallTimeCapMs: 500 });
  const stop = shouldStop(task, 2_000);
  assert.equal(stop?.kind, "wall-time-cap");
});

test("shouldStop surfaces agent-decided done", () => {
  const stop = shouldStop(
    liveTask({ status: "done", endReason: "exit predicate met", endedAtMs: 1 }),
  );
  assert.deepEqual(stop, { kind: "agent-decided-done", reason: "exit predicate met" });
});

test("shouldStop surfaces agent-decided escalate", () => {
  const stop = shouldStop(
    liveTask({
      status: "halted",
      escalated: true,
      escalationReason: "credentials missing",
      endedAtMs: 1,
    }),
  );
  assert.deepEqual(stop, { kind: "agent-decided-escalate", reason: "credentials missing" });
});

test("needsCompaction fires once the state's bytes exceed budget", () => {
  const task = liveTask();
  assert.equal(needsCompaction(task), false);
  const bigFindings = Array.from({ length: 50 }, (_, i) => ({
    source: "validate-architecture",
    severity: "gate",
    message: "x".repeat(500),
    iteration: 1,
    tsMs: i,
  }));
  const bigTask = { ...task, findings: bigFindings };
  assert.ok(approxStateSize(bigTask) > DEFAULT_SCRATCHPAD_COMPACT_THRESHOLD);
  assert.equal(needsCompaction(bigTask), true);
});
