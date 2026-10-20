// invoke-expert.test.mjs — the policy-mediated dispatcher.

import assert from "node:assert/strict";
import { test } from "node:test";

import { dispatchInProcess } from "../dist/experts/dispatcher.js";
import {
  registerInProcessExpert,
  resetHandlerRegistry,
  registerReferenceHandlers,
} from "../dist/experts/registry-handlers.js";
import { resetPolicyEngineSingleton, PolicyEngine } from "../dist/policy/engine.js";

function silentAudit() {
  return { records: [], write(r) { this.records.push(r); } };
}

function withEngine(mode, body) {
  resetPolicyEngineSingleton();
  const sink = silentAudit();
  // Prime the singleton by constructing it with our audit sink.
  // getPolicyEngine() returns this instance for subsequent calls.
  const { getPolicyEngine } = import("../dist/policy/engine.js");
  return getPolicyEngine
    ? Promise.resolve(getPolicyEngine).then(async (fn) => {
        return fn({ mode, auditSink: sink });
      })
    : null;
}

async function setupEngine(mode) {
  resetPolicyEngineSingleton();
  const sink = silentAudit();
  const { getPolicyEngine } = await import("../dist/policy/engine.js");
  // Prime the module-level singleton with our sink + mode.
  getPolicyEngine({ mode, auditSink: sink });
  return { sink };
}

test("dispatchInProcess returns unknown_expert for missing id", async () => {
  resetHandlerRegistry();
  resetPolicyEngineSingleton();
  const result = await dispatchInProcess({ expertId: "nope", input: { goal: "x" } });
  assert.equal(result.kind, "unknown_expert");
  assert.equal(result.expertId, "nope");
});

test("ENFORCE denies when the required capability has no permit", async () => {
  resetHandlerRegistry();
  const { sink } = await setupEngine("ENFORCE");
  registerInProcessExpert({
    id: "writer-noop",
    cluster: "code-quality",
    persona: "stub",
    requiredCapabilities: [{ kind: "write:fs", scope: "src/" }],
    async invoke() {
      throw new Error("must not run under deny");
    },
  });
  const result = await dispatchInProcess({
    expertId: "writer-noop",
    input: { goal: "mutate code" },
    phase: "phase-4",
    autonomyMode: "interactive",
  });
  assert.equal(result.kind, "approval_required");
  // write:fs: Invoke deny, Approve allow → requireApproval; the dispatcher
  // routes to the elicitation path, which fails `unavailable` here because
  // no transport was passed. That is the fail-closed path.
  assert.equal(result.error.outcome, "unavailable");
  assert.equal(sink.records.at(-1).decision, "requireApproval");
});

test("ENFORCE allows a handler whose capability is permitted", async () => {
  resetHandlerRegistry();
  await setupEngine("ENFORCE");
  registerInProcessExpert({
    id: "reader-noop",
    cluster: "security",
    persona: "stub",
    requiredCapabilities: [{ kind: "read:fs" }],
    async invoke(input) {
      return {
        ok: true,
        expertId: "reader-noop",
        summary: "noop",
        findings: [],
        runtimeMs: 1,
        data: { goal: input.goal },
      };
    },
  });
  const result = await dispatchInProcess({
    expertId: "reader-noop",
    input: { goal: "scan" },
    phase: "phase-4",
  });
  assert.equal(result.kind, "ok");
  assert.equal(result.output.summary, "noop");
  assert.equal(result.decisions.length, 1);
  assert.equal(result.decisions[0].effective, "allow");
});

test("elicitation transport (accept with confirm=true) permits the call", async () => {
  resetHandlerRegistry();
  await setupEngine("ENFORCE");
  registerInProcessExpert({
    id: "writer-approved",
    cluster: "code-quality",
    persona: "stub",
    requiredCapabilities: [{ kind: "write:fs", scope: "src/" }],
    async invoke() {
      return {
        ok: true,
        expertId: "writer-approved",
        summary: "wrote",
        findings: [],
        runtimeMs: 1,
      };
    },
  });
  const transport = {
    async requestApproval() {
      return { outcome: "accepted", confirmedBy: "approved by test" };
    },
  };
  const result = await dispatchInProcess(
    {
      expertId: "writer-approved",
      input: { goal: "write" },
      phase: "phase-4",
      autonomyMode: "interactive",
    },
    { approvalTransport: transport },
  );
  assert.equal(result.kind, "ok");
  assert.equal(result.output.ok, true);
});

test("elicitation transport (declined) blocks the call", async () => {
  resetHandlerRegistry();
  await setupEngine("ENFORCE");
  registerInProcessExpert({
    id: "writer-declined",
    cluster: "code-quality",
    persona: "stub",
    requiredCapabilities: [{ kind: "write:fs", scope: "src/" }],
    async invoke() {
      throw new Error("must not run under decline");
    },
  });
  const transport = {
    async requestApproval() {
      return { outcome: "declined", detail: "test said no" };
    },
  };
  const result = await dispatchInProcess(
    {
      expertId: "writer-declined",
      input: { goal: "write" },
      autonomyMode: "interactive",
    },
    { approvalTransport: transport },
  );
  assert.equal(result.kind, "approval_required");
  assert.equal(result.error.outcome, "declined");
});

test("OFF mode runs the handler regardless of policy outcome", async () => {
  resetHandlerRegistry();
  await setupEngine("OFF");
  registerInProcessExpert({
    id: "would-be-denied",
    cluster: "testing",
    persona: "stub",
    requiredCapabilities: [{ kind: "shell:destructive" }],
    async invoke() {
      return {
        ok: true,
        expertId: "would-be-denied",
        summary: "ran under OFF",
        findings: [],
        runtimeMs: 1,
      };
    },
  });
  const result = await dispatchInProcess({
    expertId: "would-be-denied",
    input: { goal: "x" },
  });
  assert.equal(result.kind, "ok");
  // The record kept in-engine says "deny" but effective was "allow" per OFF.
  assert.equal(result.decisions[0].decision, "deny");
  assert.equal(result.decisions[0].effective, "allow");
});

test("LOG_ONLY mode logs deny but still runs the handler", async () => {
  resetHandlerRegistry();
  await setupEngine("LOG_ONLY");
  registerInProcessExpert({
    id: "logged-only",
    cluster: "testing",
    persona: "stub",
    requiredCapabilities: [{ kind: "shell:destructive" }],
    async invoke() {
      return {
        ok: true,
        expertId: "logged-only",
        summary: "ran under LOG_ONLY",
        findings: [],
        runtimeMs: 1,
      };
    },
  });
  const result = await dispatchInProcess({
    expertId: "logged-only",
    input: { goal: "x" },
  });
  assert.equal(result.kind, "ok");
  assert.equal(result.decisions[0].decision, "deny");
  assert.equal(result.decisions[0].effective, "allow");
});
