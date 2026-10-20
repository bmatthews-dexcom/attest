// policy-engine.test.mjs — Shape-C Cedar policy engine coverage.
// Verifies the three enforcement modes (OFF, LOG_ONLY, ENFORCE) and that
// the two-pass evaluation (Invoke → Approve) returns the right decision.

import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  PolicyEngine,
  resetPolicyEngineSingleton,
} from "../dist/policy/engine.js";
import { parsePolicyMode } from "../dist/policy/types.js";

function makeEngine(mode) {
  resetPolicyEngineSingleton();
  const dir = mkdtempSync(join(tmpdir(), "attest-policy-"));
  const sink = { records: [], write(r) { this.records.push(r); } };
  const engine = new PolicyEngine({ mode, auditSink: sink });
  return { engine, sink, dir };
}

const invokeContext = (overrides = {}) => ({
  expertId: "secrets-scanner",
  cluster: "security",
  capability: { kind: "read:fs" },
  phase: "phase-4",
  autonomyMode: "interactive",
  toolName: "invoke_expert_secrets_scanner",
  ...overrides,
});

test("parsePolicyMode normalises every documented spelling", () => {
  assert.equal(parsePolicyMode(undefined), "ENFORCE");
  assert.equal(parsePolicyMode(""), "ENFORCE");
  assert.equal(parsePolicyMode("off"), "OFF");
  assert.equal(parsePolicyMode("DISABLED"), "OFF");
  assert.equal(parsePolicyMode("log"), "LOG_ONLY");
  assert.equal(parsePolicyMode("log_only"), "LOG_ONLY");
  assert.equal(parsePolicyMode("log-only"), "LOG_ONLY");
  assert.equal(parsePolicyMode("ENFORCE"), "ENFORCE");
  assert.equal(parsePolicyMode("gibberish"), "ENFORCE");
});

test("policy engine loads the bundle and reports Cedar version", () => {
  const { engine } = makeEngine("ENFORCE");
  assert.match(engine.cedarVersion, /^\d+\.\d+/);
  assert.ok(engine.policyIds.includes("00-default-deny"));
  assert.ok(engine.policyIds.includes("10-read-fs-always-allowed"));
  assert.ok(engine.policyIds.includes("30-code-mutator-requires-approval"));
});

test("ENFORCE mode allows read:fs for secrets-scanner", () => {
  const { engine, sink } = makeEngine("ENFORCE");
  const decision = engine.evaluatePolicy(invokeContext());
  assert.equal(decision.decision, "allow");
  assert.equal(decision.effective, "allow");
  assert.ok(decision.determiningPolicies.length > 0);
  assert.equal(sink.records.length, 1);
  assert.equal(sink.records[0].effective, "allow");
});

test("ENFORCE mode denies shell:destructive universally", () => {
  const { engine, sink } = makeEngine("ENFORCE");
  const decision = engine.evaluatePolicy(
    invokeContext({
      expertId: "security-auditor",
      capability: { kind: "shell:destructive" },
    }),
  );
  assert.equal(decision.decision, "deny");
  assert.equal(decision.effective, "deny");
  // 40-destructive-shell-forbidden should be in the determining set.
  assert.ok(
    decision.determiningPolicies.includes("40-destructive-shell-forbidden"),
    `expected 40-destructive-shell-forbidden in ${JSON.stringify(decision.determiningPolicies)}`,
  );
  assert.equal(sink.records.length, 1);
  assert.equal(sink.records[0].decision, "deny");
});

test("ENFORCE mode returns requireApproval for write:fs", () => {
  const { engine, sink } = makeEngine("ENFORCE");
  const decision = engine.evaluatePolicy(
    invokeContext({
      expertId: "semgrep-runner",
      cluster: "security",
      capability: { kind: "write:fs", scope: "docs/work/" },
    }),
  );
  assert.equal(decision.decision, "requireApproval");
  assert.equal(decision.effective, "requireApproval");
  assert.ok(
    decision.determiningPolicies.includes("30-code-mutator-requires-approval"),
    `expected 30-code-mutator-requires-approval, got ${JSON.stringify(decision.determiningPolicies)}`,
  );
  assert.equal(sink.records.length, 1);
  assert.equal(sink.records[0].effective, "requireApproval");
});

test("LOG_ONLY mode logs the real decision but effective is allow", () => {
  const { engine, sink } = makeEngine("LOG_ONLY");
  const decision = engine.evaluatePolicy(
    invokeContext({
      expertId: "secrets-scanner",
      capability: { kind: "shell:destructive" },
    }),
  );
  assert.equal(decision.decision, "deny");
  assert.equal(decision.effective, "allow");
  assert.equal(decision.mode, "LOG_ONLY");
  assert.equal(sink.records[0].decision, "deny");
  assert.equal(sink.records[0].effective, "allow");
});

test("OFF mode records the decision and short-circuits enforcement", () => {
  const { engine, sink } = makeEngine("OFF");
  const decision = engine.evaluatePolicy(
    invokeContext({
      expertId: "secrets-scanner",
      capability: { kind: "write:fs" },
    }),
  );
  assert.equal(decision.decision, "requireApproval");
  assert.equal(decision.effective, "allow");
  assert.equal(decision.mode, "OFF");
  assert.equal(sink.records[0].mode, "OFF");
  assert.equal(sink.records[0].effective, "allow");
});

test("audit record carries every policy context field", () => {
  const { engine, sink } = makeEngine("ENFORCE");
  const now = new Date("2026-10-20T12:00:00.000Z");
  const engine2 = new (engine.constructor)({
    mode: "ENFORCE",
    auditSink: sink,
    now: () => now,
  });
  const ctx = invokeContext({ taskId: "task-xyz", reason: "coverage below threshold" });
  const decision = engine2.evaluatePolicy(ctx);
  const record = sink.records.at(-1);
  assert.ok(record);
  assert.equal(record.ts, now.toISOString());
  assert.equal(record.expertId, ctx.expertId);
  assert.equal(record.cluster, ctx.cluster);
  assert.deepEqual(record.capability, ctx.capability);
  assert.equal(record.taskId, ctx.taskId);
  assert.equal(record.autonomyMode, ctx.autonomyMode);
  assert.equal(record.toolName, ctx.toolName);
  assert.equal(record.decision, decision.decision);
  assert.equal(record.effective, decision.effective);
});
