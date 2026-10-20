// Slash command parser tests for the Director agent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDirectorCommand } from "../bot/lib/commands.ts";

test("non-/director body returns null", () => {
  assert.equal(parseDirectorCommand(""), null);
  assert.equal(parseDirectorCommand("hello"), null);
});

test("bare /director returns help", () => {
  assert.deepEqual(parseDirectorCommand("/director"), { kind: "help" });
  assert.deepEqual(parseDirectorCommand("  /director  "), { kind: "help" });
});

test("/director status with no id → list form", () => {
  const got = parseDirectorCommand("/director status");
  assert.equal(got?.kind, "status");
  assert.equal(got.targetId, undefined);
});

test("/director status <id> → scoped show", () => {
  const got = parseDirectorCommand("/director status rb-20261020-abcd");
  assert.deepEqual(got, { kind: "status", targetId: "rb-20261020-abcd" });
});

test("/director approve requires an id (otherwise unknown)", () => {
  assert.equal(parseDirectorCommand("/director approve")?.kind, "unknown");
  assert.deepEqual(parseDirectorCommand("/director approve rb-x"), {
    kind: "approve",
    targetId: "rb-x",
  });
});

test("/director deny captures optional --reason", () => {
  const got = parseDirectorCommand('/director deny rb-x --reason "not now"');
  assert.deepEqual(got, { kind: "deny", targetId: "rb-x", reason: "not now" });

  const got2 = parseDirectorCommand("/director deny rb-y --reason low-value");
  assert.deepEqual(got2, { kind: "deny", targetId: "rb-y", reason: "low-value" });
});

test("/director sweep accepts optional expert id", () => {
  assert.deepEqual(parseDirectorCommand("/director sweep"), { kind: "sweep" });
  assert.deepEqual(parseDirectorCommand("/director sweep release-notes-writer"), {
    kind: "sweep",
    expertId: "release-notes-writer",
  });
});

test("/director refine requires an expert id", () => {
  assert.equal(parseDirectorCommand("/director refine")?.kind, "unknown");
  const got = parseDirectorCommand('/director refine release-notes-writer --reason "needs tone"');
  assert.deepEqual(got, {
    kind: "refine",
    expertId: "release-notes-writer",
    reason: "needs tone",
  });
});

test("/director create picks role + urgency defaults", () => {
  const got = parseDirectorCommand("/director create release-notes-writer");
  assert.equal(got?.kind, "create");
  assert.equal(got.role, "release-notes-writer");
  assert.equal(got.urgency, "normal");
});

test("/director create --urgency urgent is honoured", () => {
  const got = parseDirectorCommand("/director create release-notes-writer --urgency urgent");
  assert.equal(got?.kind, "create");
  assert.equal(got.urgency, "urgent");
});

test("/director set-autonomy draft-and-approve is accepted", () => {
  const got = parseDirectorCommand("/director set-autonomy draft-and-approve");
  assert.deepEqual(got, { kind: "set-autonomy", mode: "draft-and-approve" });
});

test("/director set-autonomy auto-for-repeat-role=true carries the hook", () => {
  const got = parseDirectorCommand(
    "/director set-autonomy draft-and-approve auto-for-repeat-role=true",
  );
  assert.deepEqual(got, {
    kind: "set-autonomy",
    mode: "draft-and-approve",
    autoForRepeatRole: true,
  });
});

test("/director set-autonomy unknown mode returns unknown", () => {
  const got = parseDirectorCommand("/director set-autonomy full-auto");
  assert.equal(got?.kind, "unknown");
});

test("/director <unknown-verb> returns unknown", () => {
  const got = parseDirectorCommand("/director nuke-everything");
  assert.equal(got?.kind, "unknown");
});
