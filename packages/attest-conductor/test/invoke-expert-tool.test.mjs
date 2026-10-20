import { test } from "node:test";
import assert from "node:assert/strict";

const { default: invokeExpertTool } = await import("../bot/tools/invoke_expert.ts");
const { default: setAutonomyModeTool } = await import("../bot/tools/set_autonomy_mode.ts");
const { newTask, taskKey } = await import("../bot/lib/conductor-state.ts");

function makeCtx({ invokeExpertResponse, taskStore } = {}) {
  const kv = new Map(taskStore ?? []);
  const calls = [];
  return {
    _kv: kv,
    _calls: calls,
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
        async callTool(server, tool, args) {
          calls.push({ server, tool, args });
          if (tool === "invoke_expert") {
            return invokeExpertResponse ?? {
              kind: "expert_output",
              summary: "default stub ok",
              result: { stubbed: true },
            };
          }
          throw new Error(`unexpected tool ${tool}`);
        },
      },
    },
  };
}

test("invoke_expert tool consumes expert_output and bumps iteration", async () => {
  const task = newTask({ goal: "test" });
  const ctx = makeCtx({
    taskStore: [[taskKey(task.taskId), task]],
    invokeExpertResponse: {
      kind: "expert_output",
      summary: "security-auditor found 0 gaps",
      result: { gaps: [] },
    },
  });

  const result = await invokeExpertTool.execute(
    { taskId: task.taskId, expertId: "security-auditor", prompt: "audit", actionId: "t0-a" },
    ctx,
  );

  assert.equal(result.outcome, "expert_output");
  assert.ok(result.summary.includes("found 0 gaps"));
  const stored = await ctx.host.kv.get(taskKey(task.taskId));
  assert.equal(stored.iteration, 1);
  assert.equal(stored.visitedExperts.length, 1);
  assert.equal(stored.visitedExperts[0].status, "ok");
  assert.equal(stored.consecutiveNoProgress, 0);
});

test("invoke_expert tool surfaces policy_denied as structured finding", async () => {
  const task = newTask({ goal: "test" });
  const ctx = makeCtx({
    taskStore: [[taskKey(task.taskId), task]],
    invokeExpertResponse: {
      kind: "policy_denied",
      reason: "write:src not allowed in phase intake",
      capability: "write:src",
      ruleId: "default-deny",
    },
  });

  const result = await invokeExpertTool.execute(
    { taskId: task.taskId, expertId: "semgrep-fix", prompt: "fix", actionId: "t0-pd" },
    ctx,
  );

  assert.equal(result.outcome, "policy_denied");
  assert.equal(result.policy?.capability, "write:src");
  const stored = await ctx.host.kv.get(taskKey(task.taskId));
  assert.equal(stored.consecutiveNoProgress, 1);
  const findings = stored.findings;
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "gate");
  assert.ok(findings[0].message.includes("policy denied"));
});

test("invoke_expert tool surfaces approval_required and records a soft finding", async () => {
  const task = newTask({ goal: "test" });
  const ctx = makeCtx({
    taskStore: [[taskKey(task.taskId), task]],
    invokeExpertResponse: {
      kind: "approval_required",
      capability: "publish:npm",
      approver: "release-manager",
      prompt: "ship v3.10",
      destructiveOp: "npm" + " publish",
      target: "attest-mcp",
    },
  });

  const result = await invokeExpertTool.execute(
    { taskId: task.taskId, expertId: "release-manager", prompt: "ship", actionId: "t0-ar" },
    ctx,
  );

  assert.equal(result.outcome, "approval_required");
  assert.equal(result.approvalRequired?.capability, "publish:npm");
  const stored = await ctx.host.kv.get(taskKey(task.taskId));
  assert.equal(stored.consecutiveNoProgress, 1);
  const findings = stored.findings;
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "soft");
  assert.ok(findings[0].message.includes("approval required"));
});

test("invoke_expert tool surfaces parse_error on contract mismatch", async () => {
  const task = newTask({ goal: "test" });
  const ctx = makeCtx({
    taskStore: [[taskKey(task.taskId), task]],
    invokeExpertResponse: { kind: "mystery_outcome" },
  });

  const result = await invokeExpertTool.execute(
    { taskId: task.taskId, expertId: "guide", prompt: "triage", actionId: "t0-pe" },
    ctx,
  );
  assert.equal(result.outcome, "parse_error");
  assert.ok(result.summary.includes("contract mismatch"));
});

test("invoke_expert tool is idempotent via actionId", async () => {
  const task = newTask({ goal: "test" });
  const ctx = makeCtx({
    taskStore: [[taskKey(task.taskId), task]],
    invokeExpertResponse: {
      kind: "expert_output",
      summary: "ok",
      result: {},
    },
  });

  const first = await invokeExpertTool.execute(
    { taskId: task.taskId, expertId: "guide", prompt: "x", actionId: "same" },
    ctx,
  );
  const second = await invokeExpertTool.execute(
    { taskId: task.taskId, expertId: "guide", prompt: "x", actionId: "same" },
    ctx,
  );
  assert.equal(first.outcome, "expert_output");
  assert.equal(second.outcome, "expert_output");
  assert.equal(second.already, true);
  const stored = await ctx.host.kv.get(taskKey(task.taskId));
  assert.equal(stored.visitedExperts.length, 1);
  // Idempotency guard short-circuits BEFORE calling the MCP server a
  // second time — exactly one invoke_expert call under the same actionId.
  assert.equal(ctx._calls.filter((c) => c.tool === "invoke_expert").length, 1);
});

test("set_autonomy_mode mutates the task's autonomy mode", async () => {
  const task = newTask({ goal: "test" });
  const ctx = makeCtx({ taskStore: [[taskKey(task.taskId), task]] });
  const res = await setAutonomyModeTool.execute(
    { taskId: task.taskId, mode: "approve-each", reason: "user asked for more care", actionId: "a1" },
    ctx,
  );
  assert.ok(res.ok);
  assert.equal(res.priorMode, "auto");
  assert.equal(res.task.autonomyMode, "approve-each");
  const stored = await ctx.host.kv.get(taskKey(task.taskId));
  assert.equal(stored.autonomyMode, "approve-each");
  const entry = stored.iterationLog.find((l) => l.action === "set_autonomy_mode");
  assert.ok(entry);
  assert.ok(entry.summary.includes("auto → approve-each"));
});
