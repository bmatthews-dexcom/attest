// Autonomy schema tests. See docs §12 #3.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_AUTONOMY_CONFIG,
  DEFAULT_AUTONOMY_MODE,
  DirectorAutonomyConfigSchema,
  isAutonomyMode,
} from "../src/schema/autonomy.ts";

test("default mode is draft-and-approve", () => {
  assert.equal(DEFAULT_AUTONOMY_MODE, "draft-and-approve");
  assert.equal(DEFAULT_AUTONOMY_CONFIG.mode, "draft-and-approve");
  assert.equal(DEFAULT_AUTONOMY_CONFIG["auto-for-repeat-role"], false);
});

test("DirectorAutonomyConfigSchema defaults auto-for-repeat-role to false", () => {
  const parsed = DirectorAutonomyConfigSchema.safeParse({});
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.mode, "draft-and-approve");
  assert.equal(parsed.data["auto-for-repeat-role"], false);
});

test("DirectorAutonomyConfigSchema accepts explicit flip to true", () => {
  const parsed = DirectorAutonomyConfigSchema.safeParse({
    mode: "draft-and-approve",
    "auto-for-repeat-role": true,
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data["auto-for-repeat-role"], true);
});

test("DirectorAutonomyConfigSchema rejects unknown modes (Phase-1 single-mode constraint)", () => {
  const parsed = DirectorAutonomyConfigSchema.safeParse({
    mode: "full-auto",
    "auto-for-repeat-role": false,
  });
  assert.equal(parsed.success, false);
});

test("isAutonomyMode is a narrow type guard", () => {
  assert.equal(isAutonomyMode("draft-and-approve"), true);
  assert.equal(isAutonomyMode("full-auto"), false);
  assert.equal(isAutonomyMode(42), false);
  assert.equal(isAutonomyMode(undefined), false);
});
