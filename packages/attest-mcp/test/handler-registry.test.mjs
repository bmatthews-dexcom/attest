// handler-registry.test.mjs — the Shape-C in-process handler framework.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  listInProcessHandlers,
  registerInProcessExpert,
  resetHandlerRegistry,
  registerReferenceHandlers,
  hasInProcessHandler,
} from "../dist/experts/registry-handlers.js";
import {
  describeAllHandlers,
  toolNameForHandler,
} from "../dist/experts/dispatcher.js";

test("registerReferenceHandlers wires secrets-scanner, dependency-auditor, semgrep-runner", () => {
  resetHandlerRegistry();
  registerReferenceHandlers();
  const ids = listInProcessHandlers().map((h) => h.id);
  assert.deepEqual(
    ids,
    ["dependency-auditor", "secrets-scanner", "semgrep-runner"],
    `expected the three reference handlers, got ${JSON.stringify(ids)}`,
  );
  for (const id of ids) assert.ok(hasInProcessHandler(id));
});

test("each reference handler declares its documented capability spectrum", () => {
  resetHandlerRegistry();
  registerReferenceHandlers();
  const handlers = Object.fromEntries(
    listInProcessHandlers().map((h) => [h.id, h.requiredCapabilities.map((c) => c.kind)]),
  );
  assert.deepEqual(handlers["secrets-scanner"], ["read:fs"]);
  assert.deepEqual(handlers["dependency-auditor"], ["read:fs", "net:fetch"]);
  assert.deepEqual(handlers["semgrep-runner"], ["read:fs", "shell:safe"]);
});

test("describeAllHandlers builds stable tool names and resource URIs", () => {
  resetHandlerRegistry();
  registerReferenceHandlers();
  const described = describeAllHandlers();
  for (const d of described) {
    assert.equal(d.toolName, toolNameForHandler(d.id));
    assert.ok(d.toolName.startsWith("invoke_expert_"));
    assert.equal(d.resourceUri, `attest://experts/${d.id}/handler`);
  }
});

test("duplicate registration throws", () => {
  resetHandlerRegistry();
  const handler = {
    id: "temp-expert",
    cluster: "testing",
    persona: "stub",
    requiredCapabilities: [{ kind: "read:fs" }],
    async invoke() {
      return {
        ok: true,
        expertId: "temp-expert",
        summary: "noop",
        findings: [],
        runtimeMs: 0,
      };
    },
  };
  registerInProcessExpert(handler);
  assert.throws(() => registerInProcessExpert(handler), /already registered/);
});

test("invalid id format is rejected", () => {
  resetHandlerRegistry();
  const bad = {
    id: "Bad_Id",
    cluster: "testing",
    persona: "stub",
    requiredCapabilities: [{ kind: "read:fs" }],
    async invoke() {
      return { ok: true, expertId: "Bad_Id", summary: "x", findings: [], runtimeMs: 0 };
    },
  };
  assert.throws(() => registerInProcessExpert(bad), /kebab-case/);
});
