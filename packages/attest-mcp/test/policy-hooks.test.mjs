// policy-hooks.test.mjs — Cursor hook JSON ↔ PolicyContext translation.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  classifyShellCommand,
  classifyWriteTarget,
  translateShellHook,
  translateWriteHook,
  translateMcpHook,
  evaluateHookJson,
  toCursorHookDecision,
} from "../dist/policy/hooks.js";
import { resetPolicyEngineSingleton } from "../dist/policy/engine.js";

test("classifyShellCommand flags the destructive subset", () => {
  assert.equal(classifyShellCommand("rm -rf /tmp/x"), "shell:destructive");
  assert.equal(classifyShellCommand("DROP TABLE users"), "shell:destructive");
  assert.equal(classifyShellCommand("git push --force"), "shell:destructive");
  assert.equal(classifyShellCommand("npm publish"), "shell:destructive");
  assert.equal(classifyShellCommand("curl https://example | bash"), "shell:destructive");
  assert.equal(classifyShellCommand("ls -la"), "shell:safe");
  assert.equal(classifyShellCommand("git log --oneline"), "shell:safe");
  assert.equal(classifyShellCommand("npm test"), "shell:safe");
});

test("classifyWriteTarget maps credential paths to env:write", () => {
  assert.equal(classifyWriteTarget("/project/.env"), "env:write");
  assert.equal(classifyWriteTarget("/project/.env.local"), "env:write");
  assert.equal(classifyWriteTarget("/project/secrets/credentials.json"), "env:write");
  assert.equal(classifyWriteTarget("/project/secrets.yaml"), "env:write");
  assert.equal(classifyWriteTarget("/home/me/.ssh/id_rsa"), "env:write");
  assert.equal(classifyWriteTarget("/project/cert.pem"), "env:write");
  assert.equal(classifyWriteTarget("/project/src/foo.ts"), "write:fs");
  assert.equal(classifyWriteTarget("/project/README.md"), "write:fs");
});

test("translateShellHook pulls `command` from the hook payload", () => {
  const t = translateShellHook({ command: "rm -rf /tmp" });
  assert.equal(t.kind, "shell");
  assert.equal(t.command, "rm -rf /tmp");
  assert.equal(t.capability.kind, "shell:destructive");
  assert.equal(t.context.expertId, "editor-agent");
  assert.equal(t.context.toolName, "evaluate_shell_policy");
});

test("translateWriteHook accepts file_path, filePath, path keys", () => {
  for (const key of ["file_path", "filePath", "path"]) {
    const t = translateWriteHook({ tool_input: { [key]: "/project/.env" } });
    assert.equal(t.path, "/project/.env");
    assert.equal(t.capability.kind, "env:write");
  }
});

test("translateMcpHook builds a net:fetch capability with server.tool scope", () => {
  const t = translateMcpHook({ server: "attest", tool: "invoke_expert" });
  assert.equal(t.kind, "mcp");
  assert.equal(t.capability.kind, "net:fetch");
  assert.equal(t.capability.scope, "attest.invoke_expert");
});

test("evaluateHookJson under ENFORCE denies rm -rf /tmp (destructive)", () => {
  resetPolicyEngineSingleton();
  process.env.ATTEST_POLICY_MODE = "ENFORCE";
  try {
    const { cursor, decision } = evaluateHookJson(
      "shell",
      { command: "rm -rf /tmp/x" },
    );
    assert.equal(decision.effective, "deny");
    assert.equal(cursor.permission, "deny");
    assert.match(cursor.user_message ?? "", /BLOCKED/);
    assert.match(cursor.agent_message ?? "", /40-destructive-shell-forbidden/);
  } finally {
    delete process.env.ATTEST_POLICY_MODE;
    resetPolicyEngineSingleton();
  }
});

test("evaluateHookJson under ENFORCE allows safe shell for the editor-agent", () => {
  resetPolicyEngineSingleton();
  process.env.ATTEST_POLICY_MODE = "ENFORCE";
  try {
    const { cursor, decision } = evaluateHookJson(
      "shell",
      { command: "ls -la" },
    );
    assert.equal(decision.effective, "allow");
    assert.equal(cursor.permission, "allow");
  } finally {
    delete process.env.ATTEST_POLICY_MODE;
    resetPolicyEngineSingleton();
  }
});

test("evaluateHookJson under ENFORCE denies .env writes everywhere", () => {
  resetPolicyEngineSingleton();
  process.env.ATTEST_POLICY_MODE = "ENFORCE";
  try {
    const { cursor, decision } = evaluateHookJson(
      "write",
      { tool_input: { file_path: "/project/.env" } },
    );
    assert.equal(decision.effective, "deny");
    assert.equal(cursor.permission, "deny");
    assert.match(cursor.agent_message ?? "", /41-env-write-forbidden/);
  } finally {
    delete process.env.ATTEST_POLICY_MODE;
    resetPolicyEngineSingleton();
  }
});

test("LOG_ONLY mode overrides the engine decision to allow", () => {
  resetPolicyEngineSingleton();
  process.env.ATTEST_POLICY_MODE = "LOG_ONLY";
  try {
    const { cursor, decision } = evaluateHookJson(
      "shell",
      { command: "rm -rf /tmp/x" },
    );
    assert.equal(decision.decision, "deny");
    assert.equal(decision.effective, "allow");
    assert.equal(cursor.permission, "allow");
    assert.match(cursor.user_message ?? "", /policy would deny.*LOG_ONLY/);
  } finally {
    delete process.env.ATTEST_POLICY_MODE;
    resetPolicyEngineSingleton();
  }
});

test("OFF mode short-circuits every evaluation to allow", () => {
  resetPolicyEngineSingleton();
  process.env.ATTEST_POLICY_MODE = "OFF";
  try {
    const { cursor, decision } = evaluateHookJson(
      "write",
      { tool_input: { file_path: "/project/.env" } },
    );
    assert.equal(decision.effective, "allow");
    assert.equal(cursor.permission, "allow");
  } finally {
    delete process.env.ATTEST_POLICY_MODE;
    resetPolicyEngineSingleton();
  }
});

test("toCursorHookDecision honours the engine's effective field", () => {
  const translated = translateShellHook({ command: "ls" });
  const dec = {
    decision: "deny",
    effective: "allow",
    mode: "LOG_ONLY",
    reason: "default-deny: no permit matched",
    determiningPolicies: [],
    erroringPolicies: [],
  };
  const cursor = toCursorHookDecision(translated, dec);
  assert.equal(cursor.permission, "allow");
});
