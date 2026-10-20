// ported-field.test.mjs — the richer `ported` field on list_experts,
// driven by the sibling attest-experts classification manifest.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  listExperts,
  expertCatalogJSON,
  expertManifestJSON,
  resetListExpertsCache,
  portedForExpert,
  keptAsSandboxList,
} from "../dist/experts/registry.js";
import {
  resetHandlerRegistry,
  registerReferenceHandlers,
} from "../dist/experts/registry-handlers.js";

test("portedForExpert resolves wired in-process handlers to {in-process, mcp-handler}", () => {
  resetHandlerRegistry();
  registerReferenceHandlers();
  assert.deepEqual(portedForExpert("secrets-scanner"), { status: "in-process", via: "mcp-handler" });
  assert.deepEqual(portedForExpert("dependency-auditor"), { status: "in-process", via: "mcp-handler" });
  assert.deepEqual(portedForExpert("semgrep-runner"), { status: "in-process", via: "mcp-handler" });
});

test("portedForExpert marks keptAsSandbox experts (manifest-driven)", () => {
  resetHandlerRegistry();
  // security-auditor, code-reviewer, landscape-mapper are in-process-eligible
  // per the manifest but listed in inProcessEligibleKeptAsSandbox.
  assert.deepEqual(portedForExpert("security-auditor"), {
    status: "sandbox",
    via: "bdk",
    keptAsSandbox: true,
  });
  assert.deepEqual(portedForExpert("code-reviewer"), {
    status: "sandbox",
    via: "bdk",
    keptAsSandbox: true,
  });
  assert.deepEqual(portedForExpert("landscape-mapper"), {
    status: "sandbox",
    via: "bdk",
    keptAsSandbox: true,
  });
});

test("portedForExpert resolves sandbox-required experts to {sandbox, bdk}", () => {
  resetHandlerRegistry();
  // test-engineer is sandbox-required per the manifest.
  assert.deepEqual(portedForExpert("test-engineer"), { status: "sandbox", via: "bdk" });
  assert.deepEqual(portedForExpert("release-manager"), { status: "sandbox", via: "bdk" });
});

test("portedForExpert resolves in-process-eligible-but-unwired experts to {stub, null}", () => {
  resetHandlerRegistry();
  // ux-engineer is in-process-eligible per the manifest but has no handler yet.
  assert.deepEqual(portedForExpert("ux-engineer"), { status: "stub", via: null });
  assert.deepEqual(portedForExpert("performance-engineer"), { status: "stub", via: null });
});

test("expertCatalogJSON exposes portStatus (rich), ported (boolean), and classificationSummary", () => {
  resetHandlerRegistry();
  registerReferenceHandlers();
  resetListExpertsCache();
  const payload = expertCatalogJSON();
  // classificationSummary carries the kept-as-sandbox cohort.
  assert.ok(payload.classificationSummary);
  assert.deepEqual(payload.classificationSummary.inProcessEligibleKeptAsSandbox, [
    "security-auditor",
    "code-reviewer",
    "landscape-mapper",
  ]);
  assert.deepEqual(keptAsSandboxList(), [
    "security-auditor",
    "code-reviewer",
    "landscape-mapper",
  ]);
  const sec = payload.experts.find((e) => e.id === "security-auditor");
  assert.ok(sec, "security-auditor must appear in the catalog");
  assert.equal(sec.ported, true);
  assert.deepEqual(sec.portStatus, { status: "sandbox", via: "bdk", keptAsSandbox: true });
  const ux = payload.experts.find((e) => e.id === "ux-engineer");
  assert.ok(ux, "ux-engineer must appear in the catalog");
  assert.equal(ux.ported, false);
  assert.deepEqual(ux.portStatus, { status: "stub", via: null });
});

test("expertManifestJSON carries portStatus for every expert", () => {
  resetHandlerRegistry();
  registerReferenceHandlers();
  resetListExpertsCache();
  const manifest = expertManifestJSON("security-auditor");
  assert.deepEqual(manifest.portStatus, { status: "sandbox", via: "bdk", keptAsSandbox: true });
  assert.equal(manifest.ported, true);
});

test("listExperts includes every expert catalog entry with a portStatus", () => {
  resetHandlerRegistry();
  resetListExpertsCache();
  const experts = listExperts();
  assert.ok(experts.length > 0);
  for (const e of experts) {
    assert.ok(e.ported);
    assert.ok(["sandbox", "in-process", "stub"].includes(e.ported.status));
  }
});
