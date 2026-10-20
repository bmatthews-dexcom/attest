// Role brief schema + fingerprint tests. See docs §4.8.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CreateExpertInputSchema,
  RoleBriefSchema,
  newRoleBriefId,
  roleFingerprint,
} from "../src/schema/role-brief.ts";

const BASE_INPUT = {
  role: "release-notes-writer",
  title: "Release Notes Writer",
  mission: "Author customer-facing release notes from merged PR history.",
  responsibilities: [
    "collect merged PRs since the last tag",
    "classify them (feat/fix/chore/breaking)",
    "render customer-facing markdown",
  ],
  typical_inputs: [{ name: "since", type: "git-tag" }],
  typical_outputs: [{ name: "notes.md", type: "markdown" }],
  example_task: "Write release notes for v0.4.0 against v0.3.9.",
  requested_by: { source: "ceo" },
  requested_capabilities: {
    reads: ["git://log"],
    writes: ["docs/release-notes/**"],
    network: [],
    mcp_tools: ["github:list_commits"],
    shell_patterns: [],
  },
};

test("CreateExpertInputSchema accepts a well-formed brief and defaults form_factor_preference to auto", () => {
  const parsed = CreateExpertInputSchema.safeParse(BASE_INPUT);
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.form_factor_preference, "auto");
  assert.equal(parsed.data.urgency, "normal");
  assert.deepEqual(parsed.data.required_integrations, []);
  assert.deepEqual(parsed.data.golden_set, []);
});

test("CreateExpertInputSchema rejects brief with <3 responsibilities (per §4.8 min-3)", () => {
  const bad = { ...BASE_INPUT, responsibilities: ["only one"] };
  const parsed = CreateExpertInputSchema.safeParse(bad);
  assert.equal(parsed.success, false);
});

test("CreateExpertInputSchema rejects brief with >7 responsibilities (per §4.8 max-7)", () => {
  const bad = {
    ...BASE_INPUT,
    responsibilities: ["a", "b", "c", "d", "e", "f", "g", "h"],
  };
  const parsed = CreateExpertInputSchema.safeParse(bad);
  assert.equal(parsed.success, false);
});

test("CreateExpertInputSchema rejects non-kebab-case role", () => {
  const bad = { ...BASE_INPUT, role: "ReleaseNotes Writer!" };
  const parsed = CreateExpertInputSchema.safeParse(bad);
  assert.equal(parsed.success, false);
});

test("CreateExpertInputSchema rejects missing requested_by.source", () => {
  const bad = { ...BASE_INPUT, requested_by: {} };
  const parsed = CreateExpertInputSchema.safeParse(bad);
  assert.equal(parsed.success, false);
});

test("RoleBriefSchema requires id prefix 'rb-'", () => {
  const brief = {
    ...BASE_INPUT,
    id: "foo-123",
    version: "1.0",
    state: "proposed",
    proximity_check: null,
    created_at: "2026-10-20T00:00:00Z",
    updated_at: "2026-10-20T00:00:00Z",
  };
  const parsed = RoleBriefSchema.safeParse(brief);
  assert.equal(parsed.success, false);

  const parsedOk = RoleBriefSchema.safeParse({ ...brief, id: "rb-20261020-abcd" });
  assert.equal(parsedOk.success, true);
});

test("newRoleBriefId produces deterministic rb-YYYYMMDD-<rand> ids", () => {
  const id = newRoleBriefId(Date.UTC(2026, 9, 20), "xyz1");
  assert.equal(id, "rb-20261020-xyz1");
});

test("roleFingerprint is stable under whitespace + case", () => {
  const a = roleFingerprint({
    role: "Release-Notes-Writer",
    mission: "Author  release notes.",
    responsibilities: ["collect prs", "classify them"],
  });
  const b = roleFingerprint({
    role: "release-notes-writer",
    mission: "author release notes.",
    responsibilities: ["classify them", "collect prs"],
  });
  assert.equal(a, b);
  assert.match(a, /^fp-/);
});

test("roleFingerprint differs when mission diverges", () => {
  const a = roleFingerprint({
    role: "release-notes-writer",
    mission: "Author release notes.",
    responsibilities: ["x", "y"],
  });
  const b = roleFingerprint({
    role: "release-notes-writer",
    mission: "Review PRs for policy drift.",
    responsibilities: ["x", "y"],
  });
  assert.notEqual(a, b);
});
