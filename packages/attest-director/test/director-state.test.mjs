// Director agent kv-state tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DIRECTOR_CORE,
  DIRECTOR_KV,
  DIRECTOR_PHASES,
  DirectorCoreSchema,
  newActionId,
  newBriefId,
} from "../bot/lib/director-state.ts";

test("DIRECTOR_KV keys all live under director: namespace", () => {
  const keys = [
    DIRECTOR_KV.core(),
    DIRECTOR_KV.roleBrief("rb-x"),
    DIRECTOR_KV.roleBriefIndex(),
    DIRECTOR_KV.activeBrief("ses_1"),
    DIRECTOR_KV.expert("x"),
    DIRECTOR_KV.expertIndex(),
    DIRECTOR_KV.refinement("x", "ref-1"),
    DIRECTOR_KV.decision("d-1"),
    DIRECTOR_KV.approval("approval_1"),
    DIRECTOR_KV.approvalIndex({ owner: "o", repo: "r", issueNumber: 7 }),
  ];
  for (const k of keys) {
    assert.ok(k.startsWith("director:"), `expected prefix on ${k}`);
  }
});

test("DEFAULT_DIRECTOR_CORE matches Phase-1 locked defaults", () => {
  assert.equal(DEFAULT_DIRECTOR_CORE.mode, "draft-and-approve");
  assert.equal(DEFAULT_DIRECTOR_CORE["auto-for-repeat-role"], false);
});

test("DirectorCoreSchema defaults match DEFAULT_DIRECTOR_CORE", () => {
  const parsed = DirectorCoreSchema.safeParse({ updatedAt: "2026-10-20T00:00:00Z" });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.mode, "draft-and-approve");
  assert.equal(parsed.data["auto-for-repeat-role"], false);
});

test("DIRECTOR_PHASES names the 9 phase labels in order", () => {
  assert.deepEqual(DIRECTOR_PHASES, [
    "intake",
    "detect-gap",
    "research",
    "draft",
    "eval",
    "approve",
    "deploy",
    "monitor",
    "refine",
    "done",
  ]);
});

test("newBriefId uses rb-YYYYMMDD-<rand> format", () => {
  const id = newBriefId(Date.UTC(2026, 9, 20));
  assert.match(id, /^rb-20261020-[a-z0-9]{4}$/);
});

test("newActionId strips unsafe chars and tags with time", () => {
  const id = newActionId("rb-x", "draft", "generate persona");
  assert.match(id, /^rb-x:draft:generate-persona-/);
  assert.ok(id.length > "rb-x:draft:generate-persona-".length);
});
