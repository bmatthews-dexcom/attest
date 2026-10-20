import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const {
  selectTransport,
  autoApproveIfPossible,
  runRequestApproval,
  parseMcpApprovalResult,
  pollUntilResolved,
  applyReplyResolution,
  listPendingApprovalsForIssue,
} = await import("../bot/lib/request-approval-core.ts");
const { newTask, taskKey } = await import("../bot/lib/conductor-state.ts");
const { approvalKey, approvalIndexKey } = await import("../bot/lib/approvals.ts");

function makeKv() {
  const store = new Map();
  return {
    _store: store,
    async get(key) {
      return structuredClone(store.get(key));
    },
    async put(key, value) {
      store.set(key, structuredClone(value));
    },
    async delete(key) {
      store.delete(key);
    },
  };
}

function makeMcpSpy({ response, error } = {}) {
  const calls = [];
  const mcp = {
    async callTool(server, tool, args) {
      calls.push({ server, tool, args });
      if (error) throw new Error(error);
      return response ?? { content: [{ type: "text", text: JSON.stringify({ approved: true, by: "stub" }) }] };
    },
  };
  return { mcp, calls };
}

test("selectTransport picks MCP when both exist", () => {
  const pick = selectTransport({
    autonomyMode: "auto",
    capability: "write:src",
    mcpSupportsElicitation: true,
    hasGithubContext: true,
  });
  assert.equal(pick.transport, "mcp");
});

test("selectTransport prefers github for pr/publish under approve-destructive", () => {
  const pr = selectTransport({
    autonomyMode: "approve-destructive",
    capability: "pr:comment",
    mcpSupportsElicitation: true,
    hasGithubContext: true,
  });
  assert.equal(pr.transport, "github");
  const pub = selectTransport({
    autonomyMode: "approve-destructive",
    capability: "publish:npm",
    mcpSupportsElicitation: true,
    hasGithubContext: true,
  });
  assert.equal(pub.transport, "github");
});

test("selectTransport falls back to the only available transport", () => {
  assert.equal(
    selectTransport({ autonomyMode: "auto", capability: "write:src", mcpSupportsElicitation: true, hasGithubContext: false }).transport,
    "mcp",
  );
  assert.equal(
    selectTransport({ autonomyMode: "auto", capability: "write:src", mcpSupportsElicitation: false, hasGithubContext: true }).transport,
    "github",
  );
});

test("selectTransport returns none when neither transport is wired", () => {
  const pick = selectTransport({
    autonomyMode: "auto",
    capability: "write:src",
    mcpSupportsElicitation: false,
    hasGithubContext: false,
  });
  assert.equal(pick.transport, "none");
});

test("autoApproveIfPossible auto-approves non-destructive under auto mode", () => {
  const res = autoApproveIfPossible("auto", "read:workspace");
  assert.ok(res);
  assert.equal(res.approved, true);
  assert.equal(res.source, "autonomy-auto-approve");
});

test("autoApproveIfPossible does NOT auto-approve destructive under auto", () => {
  assert.equal(autoApproveIfPossible("auto", "write:src"), null);
});

test("autoApproveIfPossible NEVER auto-approves under approve-each", () => {
  assert.equal(autoApproveIfPossible("approve-each", "read:workspace"), null);
});

test("runRequestApproval auto-approves under auto for non-destructive capability", async () => {
  const kv = makeKv();
  const task = newTask({ goal: "test" });
  await kv.put(taskKey(task.taskId), task);
  const { mcp } = makeMcpSpy();
  const result = await runRequestApproval(
    { host: { kv, mcp }, mcpSupportsElicitation: false },
    { taskId: task.taskId, capability: "read:workspace", prompt: "noop" },
  );
  assert.equal(result.approved, true);
  assert.equal(result.transport, "none");
  assert.equal(result.source, "autonomy-auto-approve");
});

test("runRequestApproval fails closed with no_hitl_transport when no transport wired for destructive capability", async () => {
  const kv = makeKv();
  const task = newTask({ goal: "test" });
  await kv.put(taskKey(task.taskId), task);
  const { mcp } = makeMcpSpy();
  const result = await runRequestApproval(
    { host: { kv, mcp }, mcpSupportsElicitation: false },
    { taskId: task.taskId, capability: "write:src", prompt: "edit src/auth.ts" },
  );
  assert.equal(result.approved, false);
  assert.equal(result.reason, "no_hitl_transport");
  assert.equal(result.transport, "none");
  assert.equal(result.source, "no_transport");
});

test("runRequestApproval routes to MCP elicitation when attached", async () => {
  const kv = makeKv();
  const task = newTask({ goal: "test" });
  await kv.put(taskKey(task.taskId), task);
  const { mcp, calls } = makeMcpSpy();
  const result = await runRequestApproval(
    { host: { kv, mcp }, mcpSupportsElicitation: true },
    { taskId: task.taskId, capability: "write:src", prompt: "edit src/auth.ts" },
  );
  assert.equal(result.approved, true);
  assert.equal(result.transport, "mcp");
  assert.equal(result.source, "mcp");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].tool, "request_approval");
});

test("runRequestApproval posts a github comment and polls to resolution", async () => {
  const kv = makeKv();
  const task = newTask({
    goal: "test",
    githubContext: {
      owner: "bpmforge",
      repo: "attest",
      issueNumber: 42,
      kind: "pull_request",
    },
  });
  await kv.put(taskKey(task.taskId), task);
  const { mcp } = makeMcpSpy();
  let postedBody = null;
  const postGithubComment = async (input) => {
    postedBody = input.body;
    return { commentId: 7001 };
  };

  const resultPromise = runRequestApproval(
    {
      host: { kv, mcp },
      mcpSupportsElicitation: false,
      postGithubComment,
    },
    {
      taskId: task.taskId,
      capability: "write:src",
      prompt: "edit src/auth.ts",
      pollMs: 10,
      timeoutMs: 60_000,
    },
  );

  // Simulate a reviewer `/approve` reply arriving async.
  const settle = setTimeout(async () => {
    const pending = await listPendingApprovalsForIssue(kv, {
      owner: "bpmforge",
      repo: "attest",
      issueNumber: 42,
    });
    assert.equal(pending.length, 1);
    await applyReplyResolution(kv, pending[0].approvalId, {
      approved: true,
      source: "github",
      by: "bradford",
      reason: "lgtm",
    });
  }, 30);
  settle.unref?.();

  const result = await resultPromise;
  assert.equal(result.approved, true);
  assert.equal(result.transport, "github");
  assert.equal(result.source, "github");
  assert.equal(result.by, "bradford");
  assert.ok(postedBody?.includes("write:src"));
});

test("runRequestApproval times out when no github reply arrives in time", async () => {
  const kv = makeKv();
  const task = newTask({
    goal: "test",
    githubContext: {
      owner: "bpmforge",
      repo: "attest",
      issueNumber: 42,
      kind: "pull_request",
    },
  });
  await kv.put(taskKey(task.taskId), task);
  const { mcp } = makeMcpSpy();
  const result = await runRequestApproval(
    {
      host: { kv, mcp },
      mcpSupportsElicitation: false,
      postGithubComment: async () => ({ commentId: 42 }),
    },
    {
      taskId: task.taskId,
      capability: "write:src",
      prompt: "edit",
      pollMs: 5,
      timeoutMs: 15,
    },
  );
  assert.equal(result.approved, false);
  assert.equal(result.source, "timeout");
});

test("parseMcpApprovalResult tolerates SDK wrapper + raw shapes", () => {
  const wrapped = parseMcpApprovalResult({
    content: [{ type: "text", text: JSON.stringify({ approved: true, by: "x" }) }],
  });
  assert.equal(wrapped.approved, true);
  assert.equal(wrapped.by, "x");

  const raw = parseMcpApprovalResult({ approved: false, reason: "nope" });
  assert.equal(raw.approved, false);
  assert.equal(raw.reason, "nope");

  // Fail-closed on gibberish.
  const bogus = parseMcpApprovalResult("yes maybe");
  assert.equal(bogus.approved, false);
});

test("pollUntilResolved honors overridable sleep + clock for determinism", async () => {
  const kv = makeKv();
  const approvalId = "approval_test";
  await kv.put(approvalKey(approvalId), {
    approvalId,
    taskId: "task_1",
    capability: "write:src",
    prompt: "edit",
    autonomyMode: "auto",
    transport: "github",
    status: "pending",
    requestedAtMs: 0,
    deadlineMs: 100,
  });

  let ticks = 0;
  const resolution = await pollUntilResolved(kv, approvalId, {
    deadlineMs: 50,
    pollMs: 1,
    sleep: async () => {
      ticks++;
      if (ticks === 3) {
        await applyReplyResolution(kv, approvalId, {
          approved: true,
          source: "github",
          by: "rev",
        });
      }
    },
    now: () => ticks * 2,
  });
  assert.equal(resolution.approved, true);
});

test("applyReplyResolution is a no-op for already-resolved approvals", async () => {
  const kv = makeKv();
  const approvalId = "approval_dup";
  await kv.put(approvalKey(approvalId), {
    approvalId,
    taskId: "task_1",
    capability: "write:src",
    prompt: "edit",
    autonomyMode: "auto",
    transport: "github",
    status: "approved",
    requestedAtMs: 0,
    deadlineMs: 100,
    resolution: { approved: true, source: "github", by: "first" },
  });
  const updated = await applyReplyResolution(kv, approvalId, {
    approved: false,
    source: "github",
    by: "second",
  });
  assert.ok(updated);
  assert.equal(updated.resolution.by, "first");
});
