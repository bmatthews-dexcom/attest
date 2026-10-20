import { test } from "node:test";
import assert from "node:assert/strict";

const {
  findExpert,
  knownExpertIds,
  DEFAULT_EXPERT_REGISTRY,
} = await import("../bot/lib/experts-registry.ts");

test("findExpert / knownExpertIds expose the Shape-C fallback registry", () => {
  const ids = knownExpertIds();
  assert.ok(ids.includes("security-reviewer"));
  assert.ok(ids.includes("docs"));
  const entry = findExpert("security-reviewer");
  assert.ok(entry);
  assert.equal(entry.id, "security-reviewer");
  assert.equal(findExpert("not-a-real-expert"), undefined);
});

test("Shape-C registry drops env-driven transport switching", async () => {
  // The old Shape-A `expertEnvKey` / `resolveExpertMode` surfaces are gone;
  // routing is attest-mcp's `invoke_expert` job now.
  const mod = await import("../bot/lib/experts-registry.ts");
  assert.equal(typeof mod.resolveExpertMode, "undefined");
  assert.equal(typeof mod.expertEnvKey, "undefined");
  // Still a hint catalog for the Ralph prompt — not empty.
  assert.ok(DEFAULT_EXPERT_REGISTRY.length > 0);
});
