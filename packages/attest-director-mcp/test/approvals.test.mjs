// request_approval HITL tests. See docs §6.2.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryKvStore } from "../src/kv/store.ts";
import { directorKv } from "../src/kv/namespace.ts";
import {
  extractApprovalId,
  parseApprovalReply,
  pollUntilResolved,
  renderApprovalCommentBody,
  runRequestApproval,
  selectTransport,
} from "../src/approvals/request.ts";
import { resolveApproval } from "../src/schema/approval.ts";

test("non-destructive capability auto-approves without transport", async () => {
  const kv = new MemoryKvStore();
  const res = await runRequestApproval(
    { kv },
    {
      taskId: "task-1",
      capability: "read:web",
      prompt: "fetch openapi.json",
    },
  );
  assert.equal(res.approved, true);
  assert.equal(res.source, "autonomy-auto-approve");
});

test("forbid-tier capability short-circuits to deny without ask", async () => {
  const kv = new MemoryKvStore();
  const res = await runRequestApproval(
    { kv },
    {
      taskId: "task-forbid",
      capability: "publish:npm",
      prompt: "publish @bpmforge/x",
    },
  );
  assert.equal(res.approved, false);
  assert.equal(res.source, "forbidden-by-fence");
});

test("fail-closed when no transport is wired for destructive op", async () => {
  const kv = new MemoryKvStore();
  const res = await runRequestApproval(
    { kv },
    {
      taskId: "task-fc",
      capability: "edit:.cursor/mcp.json",
      prompt: "add director entry",
    },
  );
  assert.equal(res.approved, false);
  assert.equal(res.reason, "no_hitl_transport");
  assert.equal(res.source, "no_transport");
});

test("mcp elicitation path returns the resolution it was handed", async () => {
  const kv = new MemoryKvStore();
  const res = await runRequestApproval(
    {
      kv,
      mcpElicit: async () => ({
        approved: true,
        source: "mcp",
        by: "bradford",
        reason: "ok",
      }),
    },
    {
      taskId: "task-mcp",
      capability: "edit:.cursor/mcp.json",
      prompt: "add director entry",
    },
  );
  assert.equal(res.approved, true);
  assert.equal(res.source, "mcp");
  assert.equal(res.by, "bradford");
});

test("github transport polls kv until resolved", async () => {
  const kv = new MemoryKvStore();
  // Macrotask-based sleep so other microtasks (and the test's resolve
  // tick) can run between polls — avoids starving the microtask queue.
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const now = () => Date.now();

  // Pre-arrange a resolver that fires once the pending record exists.
  const resolverTick = (async () => {
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 5));
      const keys = await kv.listKeys("director:approval:");
      if (keys.length === 0) continue;
      const key = keys[0];
      const record = await kv.get(key);
      if (!record || record.status !== "pending") continue;
      const resolved = resolveApproval(record, {
        approved: true,
        source: "github",
        by: "bradford",
        reason: "lgtm",
      });
      await kv.put(key, resolved);
      return;
    }
  })();

  const res = await runRequestApproval(
    {
      kv,
      postGithubComment: async () => ({ commentId: 42 }),
      sleep,
      now,
    },
    {
      taskId: "task-gh",
      capability: "pr:open:local-attest-repo",
      prompt: "open PR",
      github: { owner: "x", repo: "y", issueNumber: 7 },
      timeoutMs: 10_000,
      pollMs: 5,
    },
  );
  await resolverTick;
  assert.equal(res.approved, true);
  assert.equal(res.source, "github");
});

test("github transport times out when deadline exceeded", async () => {
  const kv = new MemoryKvStore();
  let clock = 0;
  const now = () => clock;
  const sleep = async () => {
    clock += 10;
    await new Promise((r) => setImmediate(r));
  };
  const res = await runRequestApproval(
    {
      kv,
      postGithubComment: async () => ({ commentId: 1 }),
      now,
      sleep,
    },
    {
      taskId: "task-timeout",
      capability: "pr:open:local-attest-repo",
      prompt: "open PR",
      github: { owner: "x", repo: "y", issueNumber: 1 },
      timeoutMs: 5,
      pollMs: 1,
    },
  );
  assert.equal(res.approved, false);
  assert.equal(res.source, "timeout");
});

test("selectTransport prefers github paper trail for pr:/publish: ops", () => {
  const sel = selectTransport({
    capability: "pr:open:local-attest-repo",
    mcpSupportsElicitation: true,
    hasGithubContext: true,
  });
  assert.equal(sel.transport, "github");
});

test("selectTransport prefers mcp when both available for non-pr/publish ops", () => {
  const sel = selectTransport({
    capability: "edit:.cursor/mcp.json",
    mcpSupportsElicitation: true,
    hasGithubContext: true,
  });
  assert.equal(sel.transport, "mcp");
});

test("selectTransport returns 'none' when nothing is attached", () => {
  const sel = selectTransport({
    capability: "edit:.cursor/mcp.json",
    mcpSupportsElicitation: false,
    hasGithubContext: false,
  });
  assert.equal(sel.transport, "none");
});

test("renderApprovalCommentBody carries the hidden approvalId marker", () => {
  const body = renderApprovalCommentBody({
    approvalId: "approval_x",
    taskId: "task_1",
    capability: "pr:open:local-attest-repo",
    prompt: "open PR",
  });
  const extracted = extractApprovalId(body);
  assert.equal(extracted.approvalId, "approval_x");
  assert.equal(extracted.taskId, "task_1");
});

test("parseApprovalReply tolerates optional id + note", () => {
  assert.deepEqual(parseApprovalReply("/approve approval_abc all good"), {
    verb: "approve",
    approvalId: "approval_abc",
    note: "all good",
  });
  assert.deepEqual(parseApprovalReply("/deny"), { verb: "deny" });
  assert.equal(parseApprovalReply("thumbs up"), null);
  assert.equal(parseApprovalReply(""), null);
  assert.equal(parseApprovalReply(null), null);
});

test("pollUntilResolved returns the resolution once kv is updated", async () => {
  const kv = new MemoryKvStore();
  const id = "approval_test";
  const now = () => 100;
  await kv.put(directorKv.approval(id), {
    approvalId: id,
    taskId: "task-x",
    capability: "pr:open:local-attest-repo",
    prompt: "ok",
    transport: "github",
    status: "pending",
    requestedAtMs: 0,
    deadlineMs: 1_000,
  });

  // Resolve on the first sleep tick — closes the loop deterministically.
  const sleep = async () => {
    const cur = await kv.get(directorKv.approval(id));
    const resolved = resolveApproval(cur, {
      approved: true,
      source: "github",
      by: "x",
      reason: "ok",
    });
    await kv.put(directorKv.approval(id), resolved);
    await new Promise((r) => setImmediate(r));
  };
  const resolution = await pollUntilResolved(kv, id, {
    deadlineMs: 1_000,
    pollMs: 1,
    now,
    sleep,
  });
  assert.equal(resolution.approved, true);
});
