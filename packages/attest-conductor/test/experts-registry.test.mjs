import { test } from "node:test";
import assert from "node:assert/strict";

const {
  resolveExpertMode,
  expertEnvKey,
  findExpert,
  knownExpertIds,
} = await import("../bot/lib/experts-registry.ts");

test("expertEnvKey normalizes expertId for env lookup", () => {
  assert.equal(expertEnvKey("security-reviewer", "PEER"), "ATTEST_EXPERT_SECURITY_REVIEWER_PEER");
  assert.equal(expertEnvKey("docs", "URL"), "ATTEST_EXPERT_DOCS_URL");
});

test("resolveExpertMode defaults to stub when no env is set", () => {
  const mode = resolveExpertMode("security-reviewer", {});
  assert.equal(mode.kind, "stub");
});

test("resolveExpertMode prefers peer over http", () => {
  const mode = resolveExpertMode("security-reviewer", {
    ATTEST_EXPERT_SECURITY_REVIEWER_PEER: "attest-security-reviewer",
    ATTEST_EXPERT_SECURITY_REVIEWER_URL: "https://unused",
  });
  assert.deepEqual(mode, { kind: "peer", slug: "attest-security-reviewer" });
});

test("resolveExpertMode falls back to http when only url is set", () => {
  const mode = resolveExpertMode("docs", {
    ATTEST_EXPERT_DOCS_URL: "https://docs.example/agent",
  });
  assert.deepEqual(mode, { kind: "http", url: "https://docs.example/agent" });
});

test("resolveExpertMode ignores blank env values", () => {
  const mode = resolveExpertMode("docs", {
    ATTEST_EXPERT_DOCS_PEER: "   ",
    ATTEST_EXPERT_DOCS_URL: "",
  });
  assert.equal(mode.kind, "stub");
});

test("findExpert / knownExpertIds expose the default registry", () => {
  const ids = knownExpertIds();
  assert.ok(ids.includes("security-reviewer"));
  assert.ok(ids.includes("docs"));
  const entry = findExpert("security-reviewer");
  assert.ok(entry);
  assert.equal(entry.id, "security-reviewer");
  assert.equal(findExpert("not-a-real-expert"), undefined);
});
