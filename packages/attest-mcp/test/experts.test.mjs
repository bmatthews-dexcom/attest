// experts registry smoke — covers src/experts/registry.ts.

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  listExperts,
  expertById,
  expertCatalogJSON,
  expertManifestJSON,
  invocationHintForAgent,
  EXPERTS_PACKAGE,
} from "../dist/experts/registry.js";

test("listExperts enumerates all primary agents and nothing else", () => {
  const all = listExperts();
  assert.ok(all.length >= 30, `expected 30+ primary experts, got ${all.length}`);
  const ids = new Set(all.map((e) => e.id));
  assert.ok(ids.has("security-auditor"));
  assert.ok(ids.has("sdlc-lead"));
  assert.ok(ids.has("code-reviewer"));
  assert.ok(ids.has("performance-engineer"));
  // Cluster/subagent markdown must not leak in — those have mode: "subagent".
  assert.ok(!ids.has("dead-code-detector"));
});

test("every expert has a well-formed invocation hint pointing at attest-experts", () => {
  for (const e of listExperts()) {
    assert.equal(e.invocationHint.package, EXPERTS_PACKAGE);
    assert.equal(e.invocationHint.agent, e.id);
    assert.ok(e.invocationHint.spawn.includes(e.id));
    assert.ok(e.promptName.startsWith("prompt_expert_"));
    assert.ok(Array.isArray(e.recommendedPhases));
    assert.ok(e.requiredTools.length > 0);
  }
});

test("expertCatalogJSON exposes the full id derivation rule", () => {
  const payload = expertCatalogJSON();
  assert.ok(payload.idRule.includes("filename"));
  assert.equal(payload.package, EXPERTS_PACKAGE);
  assert.equal(payload.count, listExperts().length);
});

test("per-expert manifest returns persona + routing + invocation hint", () => {
  const manifest = expertManifestJSON("security-auditor");
  assert.equal(manifest.id, "security-auditor");
  assert.ok(manifest.persona.length > 100, "persona body should be non-trivial");
  assert.equal(manifest.invocationHint.agent, "security-auditor");
  assert.ok(Array.isArray(manifest.routing));
});

test("manifest throws on unknown expert id", () => {
  assert.throws(() => expertManifestJSON("not-a-real-agent"));
});

test("invocationHintForAgent resolves direct and free-text labels", () => {
  assert.equal(
    invocationHintForAgent("security-auditor")?.agent,
    "security-auditor",
  );
  assert.equal(
    invocationHintForAgent("sdlc-lead with --game")?.agent,
    "sdlc-lead",
  );
  assert.equal(invocationHintForAgent("not an agent"), null);
});
