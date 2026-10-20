import { test } from "node:test";
import assert from "node:assert/strict";

const {
  AUTONOMY_MODES,
  DEFAULT_AUTONOMY_MODE,
  DESTRUCTIVE_CAPABILITIES,
  isAutonomyMode,
  isDestructiveCapability,
  needsHumanApproval,
} = await import("../bot/lib/autonomy.ts");

test("the three Shape-C autonomy modes are declared", () => {
  assert.deepEqual([...AUTONOMY_MODES], ["auto", "approve-each", "approve-destructive"]);
  assert.equal(DEFAULT_AUTONOMY_MODE, "auto");
});

test("isAutonomyMode narrows string unions", () => {
  for (const mode of AUTONOMY_MODES) assert.equal(isAutonomyMode(mode), true);
  assert.equal(isAutonomyMode("permissive"), false);
  assert.equal(isAutonomyMode(undefined), false);
  assert.equal(isAutonomyMode(42), false);
});

test("destructive capability matcher covers the fence inventory", () => {
  // From docs/attest-chief-architecture.md §4 — these must each be
  // destructive.
  for (const cap of [
    "shell:dangerous",
    "shell:destructive",
    "write:fs",
    "write:src",
    "write:credentials",
    "git:write",
    "git:push",
    "pr:comment",
    "pr:merge",
    "publish:npm",
    "network:egress-write",
  ]) {
    assert.ok(
      isDestructiveCapability(cap),
      `${cap} should be destructive (matcher: ${DESTRUCTIVE_CAPABILITIES.join(", ")})`,
    );
  }
});

test("read-only capabilities are not destructive", () => {
  for (const cap of ["read:workspace", "read:docs/work/", "mcp:tools", "network:egress"]) {
    assert.equal(isDestructiveCapability(cap), false, `${cap} must not be destructive`);
  }
});

test("needsHumanApproval respects each autonomy mode", () => {
  // auto: only destructive asks.
  assert.equal(needsHumanApproval("auto", "read:workspace"), false);
  assert.equal(needsHumanApproval("auto", "write:src"), true);

  // approve-each: everything asks.
  assert.equal(needsHumanApproval("approve-each", "read:workspace"), true);
  assert.equal(needsHumanApproval("approve-each", "write:src"), true);

  // approve-destructive: only destructive asks.
  assert.equal(needsHumanApproval("approve-destructive", "read:workspace"), false);
  assert.equal(needsHumanApproval("approve-destructive", "pr:comment"), true);
});
