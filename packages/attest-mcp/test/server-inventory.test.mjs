// server-inventory smoke — covers src/server.ts wiring.

import assert from "node:assert/strict";
import { test } from "node:test";
import { buildServer, serverInventory } from "../dist/server.js";

test("buildServer wires every advertised tool, resource, and prompt", () => {
  const server = buildServer();
  assert.ok(server);
  const inv = serverInventory();
  assert.ok(inv.tools.total >= 70, `expected 70+ tools, got ${inv.tools.total}`);
  assert.equal(inv.tools.phase_gate_check, 1);
  assert.equal(inv.tools.route_goal, 1);
  assert.equal(inv.tools.list_experts, 1);
  assert.ok(inv.resources.total >= 10);
  assert.ok(inv.prompts.total >= 10);
});
