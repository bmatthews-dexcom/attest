// parity-tools.test.mjs — the Shape-C parity-contract MCP tools wired
// per sibling cursor-build-target PR #13's POLICY_TOOL_NAMES.

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildServer, serverInventory } from "../dist/server.js";
import { POLICY_TOOL_NAMES } from "../dist/policy/tools.js";
import { resetPolicyEngineSingleton } from "../dist/policy/engine.js";
import {
  resetHandlerRegistry,
  registerReferenceHandlers,
} from "../dist/experts/registry-handlers.js";

test("POLICY_TOOL_NAMES matches the sibling build-target parity contract", () => {
  assert.deepEqual(POLICY_TOOL_NAMES, {
    shell: "evaluate_shell_policy",
    write: "evaluate_write_policy",
    mcp: "evaluate_mcp_policy",
    fences: "list_fences",
    approval: "request_approval",
    invoke: "invoke_expert",
    preDispatch: "pre_dispatch_check",
  });
});

test("buildServer wires every parity-contract tool", () => {
  resetHandlerRegistry();
  resetPolicyEngineSingleton();
  const server = buildServer();
  assert.ok(server);
  const inv = serverInventory();
  assert.equal(inv.tools.parityContract, 6);
  assert.deepEqual(inv.tools.parityContractNames, POLICY_TOOL_NAMES);
  assert.equal(inv.tools.invoke_expert, 1);
});

test("buildServer advertises the elicitation capability on the wire", () => {
  resetHandlerRegistry();
  resetPolicyEngineSingleton();
  const server = buildServer();
  // The McpServer wraps a lower-level Server at `.server`; the latter is
  // what responds to initialize and whose capabilities land on the wire.
  const caps = server.server._capabilities ?? server.server.getCapabilities?.() ?? {};
  // The capability lands either top-level or under `experimental` — the
  // conductor (PR #14) accepts top-level `elicitation`; we also mirror
  // it under `experimental` for stricter clients.
  const hasTopLevel = "elicitation" in caps;
  const hasExperimental =
    caps.experimental && typeof caps.experimental === "object" && "elicitation" in caps.experimental;
  assert.ok(
    hasTopLevel || hasExperimental,
    `expected elicitation capability on the wire; got ${JSON.stringify(caps)}`,
  );
});

test("reference handlers are registered when buildServer runs with defaults", () => {
  resetHandlerRegistry();
  resetPolicyEngineSingleton();
  buildServer();
  // registerReferenceHandlers is idempotent — a second call is a no-op.
  registerReferenceHandlers();
  const inv = serverInventory();
  assert.ok(inv.tools.invokeExpertHandlers >= 3, `expected 3+ handlers wired, got ${inv.tools.invokeExpertHandlers}`);
});
