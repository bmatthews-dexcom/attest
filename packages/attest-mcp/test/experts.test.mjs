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
import {
  PORTED_EXPERT_IDS_FALLBACK,
  portedExpertsSource,
} from "../dist/experts/ported.js";

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

test("every expert has a well-formed invocation hint pointing at @bpmforge/attest-experts", () => {
  for (const e of listExperts()) {
    assert.equal(e.invocationHint.package, EXPERTS_PACKAGE);
    assert.equal(e.invocationHint.agent, e.id);
    assert.ok(e.invocationHint.spawn.includes(e.id));
    assert.ok(e.promptName.startsWith("prompt_expert_"));
    assert.ok(Array.isArray(e.recommendedPhases));
    assert.ok(e.requiredTools.length > 0);
    assert.equal(typeof e.ported, "boolean");
  }
});

test("ported flag matches the attest-experts manifest for Phase-1 concrete experts", () => {
  const byId = new Map(listExperts().map((e) => [e.id, e]));
  // `security-auditor` and `code-reviewer` are primary agents and show up
  // in `list_experts`; `landscape-mapper` is a cluster subagent
  // (mode: "all" under agents/sdlc/onboard/) so it ships in the
  // attest-experts manifest but intentionally does not surface here —
  // covered by the PORTED_EXPERT_IDS_FALLBACK assertion below.
  for (const id of ["security-auditor", "code-reviewer"]) {
    const e = byId.get(id);
    assert.ok(e, `${id} must appear in the catalog`);
    assert.equal(e.ported, true, `${id} is a Phase-1 concrete expert`);
  }
  // A Phase-2 stubbed id must come back ported:false. Pick a primary that
  // the manifest marks as stub.
  const stubbed = byId.get("api-designer");
  assert.ok(stubbed, "api-designer must appear in the catalog");
  assert.equal(
    stubbed.ported,
    false,
    "api-designer is still a Phase-2 stub in attest-experts",
  );
});

test("PORTED_EXPERT_IDS_FALLBACK carries the Phase-1 three", () => {
  assert.equal(PORTED_EXPERT_IDS_FALLBACK.size, 3);
  for (const id of ["security-auditor", "code-reviewer", "landscape-mapper"]) {
    assert.ok(
      PORTED_EXPERT_IDS_FALLBACK.has(id),
      `${id} missing from hardcoded fallback`,
    );
  }
});

test("portedExpertsSource reports its origin so callers can log how the set was resolved", () => {
  const source = portedExpertsSource();
  assert.ok(["env", "manifest", "fallback"].includes(source.origin));
  if (source.origin !== "fallback") {
    assert.equal(typeof source.path, "string");
  }
  assert.ok(source.ids instanceof Set);
});

test("expertCatalogJSON exposes the full id derivation rule and ported flag per entry", () => {
  const payload = expertCatalogJSON();
  assert.ok(payload.idRule.includes("filename"));
  assert.equal(payload.package, EXPERTS_PACKAGE);
  assert.equal(payload.count, listExperts().length);
  const sec = payload.experts.find((e) => e.id === "security-auditor");
  assert.ok(sec, "security-auditor missing from catalog payload");
  assert.equal(sec.ported, true);
  const stub = payload.experts.find((e) => e.id === "api-designer");
  assert.ok(stub, "api-designer missing from catalog payload");
  assert.equal(stub.ported, false);
});

test("per-expert manifest returns persona + routing + invocation hint + ported", () => {
  const manifest = expertManifestJSON("security-auditor");
  assert.equal(manifest.id, "security-auditor");
  assert.ok(manifest.persona.length > 100, "persona body should be non-trivial");
  assert.equal(manifest.invocationHint.agent, "security-auditor");
  assert.ok(Array.isArray(manifest.routing));
  assert.equal(manifest.ported, true);
  const stub = expertManifestJSON("api-designer");
  assert.equal(stub.ported, false);
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
