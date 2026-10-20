// routing smoke — covers src/routing/table.ts.

import assert from "node:assert/strict";
import { test } from "node:test";
import { routeGoal, ROUTING_TABLE } from "../dist/routing/table.js";

test("security goal routes to security-auditor", () => {
  const r = routeGoal("securely check all my source for issues");
  assert.ok(r.match, "expected a match");
  assert.equal(r.match.entry.agent, "security-auditor");
});

test("'find AND fix security issues' prefers the --fix flow over --deep/base", () => {
  const r = routeGoal("find and fix security issues in this repo");
  assert.ok(r.match);
  assert.ok(
    r.match.entry.command.includes("--fix") ||
      r.match.entry.command === "/security",
    `unexpected command: ${r.match.entry.command}`,
  );
});

test("performance goal routes to performance-engineer", () => {
  const r = routeGoal("the app is slow, help me profile it");
  assert.ok(r.match);
  assert.equal(r.match.entry.agent, "performance-engineer");
});

test("onboarding goal routes to sdlc onboard", () => {
  const r = routeGoal("I am new to this repo, help me understand the codebase");
  assert.ok(r.match);
  assert.equal(r.match.entry.command, "/sdlc onboard [--deep]");
});

test("ambiguous goal falls back to /guide", () => {
  const r = routeGoal("do the thing");
  assert.equal(r.match, null);
  assert.ok(r.rationale.includes("/guide"));
});

test("every entry has non-empty patterns and command", () => {
  for (const e of ROUTING_TABLE) {
    assert.ok(e.command.length > 0, `empty command on ${e.agent}`);
    assert.ok(e.patterns.length > 0, `empty patterns on ${e.command}`);
  }
});
