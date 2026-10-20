import { test } from "node:test";
import assert from "node:assert/strict";

const {
  newTask,
  newTaskId,
  taskKey,
  activeTaskKey,
  alreadyApplied,
  recordAction,
  DEFAULT_ITERATION_CAP,
  DEFAULT_WALL_TIME_CAP_MS,
  DEFAULT_NO_PROGRESS_CAP,
  INITIAL_PHASE,
} = await import("../bot/lib/conductor-state.ts");

test("newTaskId produces unique ids", () => {
  const a = newTaskId();
  const b = newTaskId();
  assert.notEqual(a, b);
  assert.match(a, /^task_/);
});

test("taskKey + activeTaskKey separate namespaces", () => {
  assert.equal(taskKey("task_abc"), "conductor:task:task_abc");
  assert.equal(activeTaskKey("ses_xyz"), "conductor:active:ses_xyz");
});

test("newTask seeds a running task with Shape-C Ralph defaults", () => {
  const task = newTask({ goal: "harden the login flow" });
  assert.equal(task.currentPhase, INITIAL_PHASE);
  assert.equal(task.iteration, 0);
  assert.equal(task.iterationCap, DEFAULT_ITERATION_CAP);
  assert.equal(task.wallTimeCapMs, DEFAULT_WALL_TIME_CAP_MS);
  assert.equal(task.consecutiveNoProgress, 0);
  assert.equal(task.consecutiveNoProgressCap, DEFAULT_NO_PROGRESS_CAP);
  assert.equal(task.scratchpad, "");
  assert.equal(task.status, "running");
  assert.equal(task.escalated, false);
  assert.equal(task.escalationReason, null);
  assert.deepEqual(task.actionCache, {});
  assert.deepEqual(task.iterationLog, []);
  assert.deepEqual(task.visitedExperts, []);
  assert.equal(task.phaseHistory[0].phase, INITIAL_PHASE);
  // Shape-C additions.
  assert.equal(task.autonomyMode, "auto");
  assert.deepEqual(task.pendingApprovalIds, []);
  assert.equal(task.githubContext, null);
});

test("newTask carries an explicit autonomy mode and github context", () => {
  const task = newTask({
    goal: "ship v3.10",
    autonomyMode: "approve-each",
    githubContext: {
      owner: "bpmforge",
      repo: "attest",
      issueNumber: 42,
      kind: "pull_request",
      requestedBy: "bradford",
    },
  });
  assert.equal(task.autonomyMode, "approve-each");
  assert.ok(task.githubContext);
  assert.equal(task.githubContext.owner, "bpmforge");
  assert.equal(task.githubContext.issueNumber, 42);
});

test("alreadyApplied / recordAction gate idempotent writes", () => {
  const base = newTask({ goal: "x" });
  assert.deepEqual(alreadyApplied(base, "a1"), { already: false });
  const after = recordAction(base, "a1", 2);
  assert.deepEqual(alreadyApplied(after, "a1"), { already: true, iteration: 2 });
  assert.deepEqual(alreadyApplied(after, "a2"), { already: false });
  assert.notEqual(after, base);
  assert.equal(base.actionCache.a1, undefined);
});
