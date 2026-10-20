import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

const dispatchModule = await import("../bot/tools/dispatch_expert.ts");
const {
  default: dispatchTool,
  __resetExpertCatalogCacheForTesting,
} = dispatchModule;
const { newTask, taskKey } = await import("../bot/lib/conductor-state.ts");
const concreteModule = await import("../bot/lib/concrete-experts.ts");

const ORIGINAL_ATTEST_MCP_COMMAND = process.env.ATTEST_MCP_COMMAND;

beforeEach(() => {
  __resetExpertCatalogCacheForTesting();
  delete process.env.ATTEST_MCP_COMMAND;
});

afterEach(() => {
  if (ORIGINAL_ATTEST_MCP_COMMAND === undefined) {
    delete process.env.ATTEST_MCP_COMMAND;
  } else {
    process.env.ATTEST_MCP_COMMAND = ORIGINAL_ATTEST_MCP_COMMAND;
  }
  __resetExpertCatalogCacheForTesting();
});

function makeCtx({ catalog, kvGet, kvPut, callToolSpy }) {
  const kvStore = new Map();
  return {
    host: {
      mcp: {
        callTool: async (server, tool, args) => {
          if (callToolSpy) callToolSpy({ server, tool, args });
          if (tool === "list_experts") {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ experts: catalog ?? [] }),
                },
              ],
            };
          }
          if (tool === "ask") {
            return {
              content: [{ type: "text", text: `peer ${server} saw: ${args?.message?.slice(0, 60)}` }],
            };
          }
          throw new Error(`unexpected tool ${tool}`);
        },
      },
      kv: {
        get: async (key) => kvStore.get(key) ?? kvGet?.(key),
        put: async (key, value) => {
          kvStore.set(key, value);
          kvPut?.(key, value);
        },
      },
    },
  };
}

test("stub mode: dispatch returns a canned response from the local registry", async () => {
  const task = newTask({ goal: "harden login" });
  const ctx = makeCtx({});
  await ctx.host.kv.put(taskKey(task.taskId), task);

  const result = await dispatchTool.execute(
    {
      taskId: task.taskId,
      expertId: "security-reviewer",
      prompt: "Audit the auth middleware",
      actionId: "t0-stub",
    },
    ctx,
  );
  assert.equal(result.status, "ok");
  assert.equal(result.mode, "stub");
  assert.ok(result.summary.includes("[stub security-reviewer]"));
});

test("non-stub mode: unknown expertId not in MCP catalog fails loudly", async () => {
  process.env.ATTEST_MCP_COMMAND = "npx";
  const task = newTask({ goal: "harden login" });
  const ctx = makeCtx({ catalog: [{ id: "security-auditor" }] });
  await ctx.host.kv.put(taskKey(task.taskId), task);

  const result = await dispatchTool.execute(
    {
      taskId: task.taskId,
      expertId: "not-a-real-id",
      prompt: "whatever",
      actionId: "t0-unknown",
    },
    ctx,
  );
  assert.equal(result.status, "failed");
  assert.ok(
    /list_experts/i.test(result.summary) || /catalog/i.test(result.summary),
    `expected catalog-miss summary, got: ${result.summary}`,
  );
});

test("non-stub mode: Phase-2 stub expert short-circuits with not-ported", async () => {
  process.env.ATTEST_MCP_COMMAND = "npx";
  const task = newTask({ goal: "scan for anti-slop" });
  const ctx = makeCtx({
    catalog: [
      {
        id: "anti-slop-auditor",
        invocationHint: {
          package: "attest-experts",
          agent: "anti-slop-auditor",
          spawn: "spawn attest-experts agent \"anti-slop-auditor\"",
        },
      },
    ],
  });
  await ctx.host.kv.put(taskKey(task.taskId), task);

  const result = await dispatchTool.execute(
    {
      taskId: task.taskId,
      expertId: "anti-slop-auditor",
      prompt: "scan this module",
      actionId: "t0-not-ported",
    },
    ctx,
  );
  assert.equal(result.status, "not-ported");
  assert.equal(result.mode, "not-ported");
  assert.ok(result.summary.includes("Phase-2 stub"));
  assert.equal(result.artifacts.package, "attest-experts");
});

test("non-stub mode: concrete expert dispatches to the catalog-derived peer slug", async () => {
  process.env.ATTEST_MCP_COMMAND = "npx";
  const task = newTask({ goal: "audit the login flow" });
  const spied = [];
  const ctx = makeCtx({
    catalog: [
      {
        id: "security-auditor",
        invocationHint: {
          package: "attest-experts",
          agent: "attest-expert-security-auditor",
        },
      },
    ],
    callToolSpy: (c) => spied.push(c),
  });
  await ctx.host.kv.put(taskKey(task.taskId), task);

  const result = await dispatchTool.execute(
    {
      taskId: task.taskId,
      expertId: "security-auditor",
      prompt: "Audit the login flow",
      actionId: "t0-peer",
    },
    ctx,
  );
  assert.equal(result.status, "ok");
  assert.equal(result.mode, "peer");
  assert.equal(result.artifacts.peerSlug, "attest-expert-security-auditor");
  const askCalls = spied.filter((c) => c.tool === "ask");
  assert.equal(askCalls.length, 1);
  assert.equal(askCalls[0].server, "attest-expert-security-auditor");
});

test("CONCRETE_EXPERT_IDS enumerates attest-experts' Phase-1 three concrete experts", () => {
  const { CONCRETE_EXPERT_IDS, isConcreteExpert, peerSlugForExpert } = concreteModule;
  assert.equal(CONCRETE_EXPERT_IDS.size, 3);
  for (const id of ["security-auditor", "code-reviewer", "landscape-mapper"]) {
    assert.ok(isConcreteExpert(id), `${id} should be concrete`);
    assert.equal(peerSlugForExpert(id), `attest-expert-${id}`);
  }
  assert.equal(isConcreteExpert("anti-slop-auditor"), false);
});
