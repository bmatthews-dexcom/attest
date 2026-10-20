// FROZEN CEO ↔ Director contract tests. Any change here is a wire break
// with the sibling attest-ceo-mcp worker — do not loosen without
// coordinating with CEO.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CEO_ENABLED_ENV,
  CEO_ENTRY_TOOL_NAME,
  CEO_NOTIFY_TOOL_NAME,
  CEO_RESOURCE_URIS,
  CompletionResourceSchema,
  CreateExpertInputFromCeoSchema,
  CreateExpertResponseSchema,
} from "../bot/lib/ceo-contract.ts";

test("CEO_ENTRY_TOOL_NAME is frozen as 'director.create_expert'", () => {
  assert.equal(CEO_ENTRY_TOOL_NAME, "director.create_expert");
});

test("CEO_NOTIFY_TOOL_NAME is frozen as 'director.on_expert_deployed'", () => {
  assert.equal(CEO_NOTIFY_TOOL_NAME, "director.on_expert_deployed");
});

test("CEO_ENABLED_ENV is frozen as 'ATTEST_DIRECTOR_ENABLED'", () => {
  assert.equal(CEO_ENABLED_ENV, "ATTEST_DIRECTOR_ENABLED");
});

test("CEO resource URIs use attest-director:// scheme", () => {
  assert.equal(
    CEO_RESOURCE_URIS.completion("rb-abc"),
    "attest-director://briefs/rb-abc/completion.json",
  );
  assert.equal(
    CEO_RESOURCE_URIS.expertSummary("release-notes-writer"),
    "attest-director://experts/release-notes-writer/summary.json",
  );
});

test("CreateExpertInputFromCeoSchema accepts the minimal valid brief", () => {
  const brief = {
    role: "release-notes-writer",
    title: "Release Notes Writer",
    mission: "Author release notes from merged PR history.",
    responsibilities: ["collect prs", "classify them", "render markdown"],
    typical_inputs: [{ name: "since", type: "git-tag" }],
    typical_outputs: [{ name: "notes.md", type: "markdown" }],
    example_task: "notes for v0.4.0",
    requested_by: { source: "ceo" },
    requested_capabilities: {},
  };
  const parsed = CreateExpertInputFromCeoSchema.safeParse(brief);
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.urgency, "normal");
  assert.deepEqual(parsed.data.required_integrations, []);
});

test("CreateExpertInputFromCeoSchema rejects unknown requested_by.source", () => {
  const bad = {
    role: "x",
    title: "x",
    mission: "x",
    responsibilities: ["x"],
    typical_inputs: [{ name: "a", type: "t" }],
    typical_outputs: [{ name: "a", type: "t" }],
    example_task: "x",
    requested_by: { source: "random-stranger" },
    requested_capabilities: {},
  };
  const parsed = CreateExpertInputFromCeoSchema.safeParse(bad);
  assert.equal(parsed.success, false);
});

test("CreateExpertResponseSchema enumerates the exact 5 return statuses", () => {
  for (const status of [
    "accepted",
    "duplicate",
    "org-mission-rejected",
    "invalid-brief",
    "rejected",
  ]) {
    const parsed = CreateExpertResponseSchema.safeParse({ status });
    assert.equal(parsed.success, true, `${status} must parse`);
  }

  const parsed = CreateExpertResponseSchema.safeParse({ status: "mystery" });
  assert.equal(parsed.success, false);
});

test("CompletionResourceSchema requires expert_id + form_factor + pass rate", () => {
  const ok = {
    role_brief_id: "rb-x",
    expert_id: "release-notes-writer",
    form_factor: "in-process-handler",
    eval_pass_rate: 0.85,
  };
  const parsed = CompletionResourceSchema.safeParse(ok);
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.scope, "private");

  const bad = { ...ok, eval_pass_rate: 1.5 };
  const parsedBad = CompletionResourceSchema.safeParse(bad);
  assert.equal(parsedBad.success, false);
});
