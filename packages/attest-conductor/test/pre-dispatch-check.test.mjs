import { test } from "node:test";
import assert from "node:assert/strict";

const { default: preDispatchCheckTool } = await import("../bot/tools/pre_dispatch_check.ts");
const { newTask, taskKey } = await import("../bot/lib/conductor-state.ts");

function makeCtx({ response, error, taskStore } = {}) {
  const kv = new Map(taskStore ?? []);
  return {
    host: {
      kv: {
        async get(key) {
          return kv.has(key) ? structuredClone(kv.get(key)) : undefined;
        },
        async put(key, value) {
          kv.set(key, structuredClone(value));
        },
        async delete(key) {
          kv.delete(key);
        },
      },
      mcp: {
        async callTool(_server, tool, _args) {
          if (tool !== "pre_dispatch_check") throw new Error(`unexpected tool ${tool}`);
          if (error) throw new Error(error);
          return response ?? { decision: "allow" };
        },
      },
    },
  };
}

test("pre_dispatch_check returns allow when the policy allows", async () => {
  const task = newTask({ goal: "test" });
  const ctx = makeCtx({ taskStore: [[taskKey(task.taskId), task]], response: { decision: "allow" } });
  const result = await preDispatchCheckTool.execute(
    { taskId: task.taskId, expertId: "guide" },
    ctx,
  );
  assert.equal(result.decision, "allow");
  assert.equal(result.expertId, "guide");
  assert.equal(result.taskPresent, true);
});

test("pre_dispatch_check propagates requires-approval + capability", async () => {
  const task = newTask({ goal: "test" });
  const ctx = makeCtx({
    taskStore: [[taskKey(task.taskId), task]],
    response: { decision: "requires-approval", capability: "pr:comment", reason: "post comment on PR" },
  });
  const result = await preDispatchCheckTool.execute(
    { taskId: task.taskId, expertId: "pr-reviewer" },
    ctx,
  );
  assert.equal(result.decision, "requires-approval");
  assert.equal(result.capability, "pr:comment");
  assert.equal(result.reason, "post comment on PR");
});

test("pre_dispatch_check surfaces contract mismatch as deny", async () => {
  const task = newTask({ goal: "test" });
  const ctx = makeCtx({
    taskStore: [[taskKey(task.taskId), task]],
    response: { decision: "maybe" },
  });
  const result = await preDispatchCheckTool.execute(
    { taskId: task.taskId, expertId: "guide" },
    ctx,
  );
  assert.equal(result.decision, "deny");
  assert.ok(result.reason?.includes("contract mismatch"));
});

test("pre_dispatch_check surfaces call failure as deny", async () => {
  const task = newTask({ goal: "test" });
  const ctx = makeCtx({ taskStore: [[taskKey(task.taskId), task]], error: "mcp exploded" });
  const result = await preDispatchCheckTool.execute(
    { taskId: task.taskId, expertId: "guide" },
    ctx,
  );
  assert.equal(result.decision, "deny");
  assert.ok(result.reason?.includes("mcp exploded"));
});
