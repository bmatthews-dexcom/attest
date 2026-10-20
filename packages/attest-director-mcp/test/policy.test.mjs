// Policy / fence tests. See docs §6.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateMcpPolicy,
  evaluatePolicy,
  evaluateShellPolicy,
  evaluateWritePolicy,
} from "../src/policy/cedar.ts";
import {
  FENCES,
  fenceFor,
  fencesByTier,
  isDestructiveCapability,
} from "../src/policy/fences.ts";

test("fence inventory covers always-granted, ask-each, and never tiers", () => {
  assert.ok(fencesByTier("always-granted").length >= 5);
  assert.ok(fencesByTier("ask-each").length >= 3);
  assert.ok(fencesByTier("never").length >= 5);
});

test("publish:npm is in the NEVER tier (Bradford's hard distribution constraint)", () => {
  const fence = fenceFor("publish:npm");
  assert.ok(fence, "publish:npm fence must exist");
  assert.equal(fence.tier, "never");
});

test("evaluatePolicy defaults deny for unknown capabilities", () => {
  const dec = evaluatePolicy({ capability: "banana:slice" });
  assert.equal(dec.decision, "deny");
  assert.equal(dec.ruleId, "default-deny");
});

test("evaluatePolicy returns allow for always-granted fences", () => {
  const dec = evaluatePolicy({ capability: "read:web" });
  assert.equal(dec.decision, "allow");
  assert.equal(dec.tier, "always-granted");
});

test("evaluatePolicy returns requires-approval for ask-each; allow when approval present", () => {
  const dec = evaluatePolicy({ capability: "edit:.cursor/mcp.json" });
  assert.equal(dec.decision, "requires-approval");

  const dec2 = evaluatePolicy({
    capability: "edit:.cursor/mcp.json",
    context: { approvalGranted: true },
  });
  assert.equal(dec2.decision, "allow");
});

test("evaluatePolicy returns deny for never fences — even with approval", () => {
  const dec = evaluatePolicy({
    capability: "publish:npm",
    context: { approvalGranted: true },
  });
  assert.equal(dec.decision, "deny");
});

test("evaluateShellPolicy denies destructive shell", () => {
  const dec = evaluateShellPolicy({ command: "rm", args: ["-rf", "/"] });
  assert.equal(dec.decision, "deny");
});

test("evaluateShellPolicy denies npm registry publish", () => {
  const dec = evaluateShellPolicy({ command: "npm", args: ["publish", "--access", "public"] });
  assert.equal(dec.decision, "deny");
  assert.equal(dec.capability, "publish:npm");
});

test("evaluateShellPolicy denies npm install -g", () => {
  const dec = evaluateShellPolicy({ command: "npm", args: ["install", "-g", "typescript"] });
  assert.equal(dec.decision, "deny");
  assert.equal(dec.capability, "install:npm-package-globally");
});

test("evaluateShellPolicy allows safe allowlisted commands", () => {
  for (const cmd of ["ls", "cat", "grep", "rg", "git", "node", "npm", "jq"]) {
    const dec = evaluateShellPolicy({ command: cmd, args: [] });
    assert.equal(dec.decision, "allow", `${cmd} should be allowed`);
  }
});

test("evaluateWritePolicy denies writes to secrets and credentials", () => {
  const dec = evaluateWritePolicy({ path: ".env" });
  assert.equal(dec.decision, "deny");

  const dec2 = evaluateWritePolicy({ path: "/home/x/id_rsa" });
  assert.equal(dec2.decision, "deny");
});

test("evaluateWritePolicy routes .cursor/mcp.json edits to ask-each", () => {
  const dec = evaluateWritePolicy({ path: "/repo/.cursor/mcp.json" });
  assert.equal(dec.decision, "requires-approval");
  assert.equal(dec.capability, "edit:.cursor/mcp.json");
});

test("evaluateWritePolicy allows writes under experts-private/", () => {
  const dec = evaluateWritePolicy({ path: "/repo/experts-private/some-expert/draft/v1/handler.ts" });
  assert.equal(dec.decision, "allow");
});

test("evaluateWritePolicy routes packages/attest-experts/experts/<new>/ writes through promotion gate", () => {
  const dec = evaluateWritePolicy({ path: "packages/attest-experts/experts/release-notes-writer/handler.ts" });
  assert.equal(dec.decision, "requires-approval");
  assert.equal(dec.capability, "pr:open:local-attest-repo");
});

test("evaluateWritePolicy forbids any write to customer source outside experts-{private,shared} paths", () => {
  const dec = evaluateWritePolicy({ path: "src/index.ts" });
  assert.equal(dec.decision, "deny");
  assert.equal(dec.capability, "write:customer-source");
});

test("evaluateMcpPolicy self-allows director MCP", () => {
  const dec = evaluateMcpPolicy({ server: "attest-director", tool: "director.create_expert" });
  assert.equal(dec.decision, "allow");
});

test("evaluateMcpPolicy forbids writes to ceo and chief namespaces", () => {
  for (const server of ["ceo", "attest-ceo", "attest-ceo-mcp"]) {
    const dec = evaluateMcpPolicy({ server, tool: "write_message" });
    assert.equal(dec.decision, "deny", `${server} writes should be denied`);
  }
  for (const server of ["chief", "attest-conductor", "attest-mcp"]) {
    const dec = evaluateMcpPolicy({ server, tool: "set_mode" });
    assert.equal(dec.decision, "deny", `${server} writes should be denied`);
  }
});

test("evaluateMcpPolicy allows read-only chief/ceo calls", () => {
  const dec = evaluateMcpPolicy({ server: "ceo", tool: "list_messages" });
  assert.equal(dec.decision, "allow");
});

test("isDestructiveCapability catches shell:destructive, git:write, publish:, pr:*", () => {
  assert.equal(isDestructiveCapability("shell:destructive"), true);
  assert.equal(isDestructiveCapability("publish:npm"), true);
  assert.equal(isDestructiveCapability("pr:open:local-attest-repo"), true);
  assert.equal(isDestructiveCapability("edit:.cursor/mcp.json"), true);
  assert.equal(isDestructiveCapability("read:web"), false);
  assert.equal(isDestructiveCapability(undefined), false);
});

test("every FENCES entry has a non-empty rationale", () => {
  for (const f of FENCES) {
    assert.ok(f.rationale.length > 0, `${f.capability} missing rationale`);
    assert.ok(f.scopeNote.length > 0, `${f.capability} missing scopeNote`);
  }
});
