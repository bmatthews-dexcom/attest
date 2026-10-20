// policy-cli.test.mjs — the Shape-C `attest-mcp-policy` bin.

import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI_POLICY = resolve(HERE, "..", "dist", "cli-policy.js");
const CLI_MAIN = resolve(HERE, "..", "dist", "cli.js");

function runPolicyBin(args, { stdin = "", env = {} } = {}) {
  const result = spawnSync(process.execPath, [CLI_POLICY, ...args], {
    input: stdin,
    env: { ...process.env, ...env, NO_COLOR: "1" },
    encoding: "utf8",
  });
  return {
    status: result.status ?? 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function runMainBin(args, { stdin = "", env = {} } = {}) {
  const result = spawnSync(process.execPath, [CLI_MAIN, ...args], {
    input: stdin,
    env: { ...process.env, ...env, NO_COLOR: "1" },
    encoding: "utf8",
  });
  return {
    status: result.status ?? 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

test("attest-mcp-policy --help prints workspace-install messaging", () => {
  const r = runPolicyBin(["--help"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /attest-mcp-policy/);
  assert.match(r.stderr, /npm install/);
  assert.match(r.stderr, /bmatthews-dexcom\/attest/);
  // Explicit anti-marketing of registry / global installs.
  assert.doesNotMatch(r.stderr, /npm i -g|npx -y/);
});

test("attest-mcp-policy evaluate --kind=shell denies rm -rf under ENFORCE", () => {
  const r = runPolicyBin(["evaluate", "--kind=shell"], {
    stdin: JSON.stringify({ command: "rm -rf /tmp/x" }),
    env: { ATTEST_POLICY_MODE: "ENFORCE" },
  });
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  const parsed = JSON.parse(r.stdout.trim());
  assert.equal(parsed.continue, true);
  assert.equal(parsed.permission, "deny");
  assert.match(parsed.agent_message, /40-destructive-shell-forbidden/);
});

test("attest-mcp-policy evaluate --kind=shell allows ls under ENFORCE (editor-agent permit)", () => {
  const r = runPolicyBin(["evaluate", "--kind=shell"], {
    stdin: JSON.stringify({ command: "ls -la" }),
    env: { ATTEST_POLICY_MODE: "ENFORCE" },
  });
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  const parsed = JSON.parse(r.stdout.trim());
  assert.equal(parsed.permission, "allow");
});

test("attest-mcp-policy evaluate --kind=write denies .env writes under ENFORCE", () => {
  const r = runPolicyBin(["evaluate", "--kind=write"], {
    stdin: JSON.stringify({ tool_input: { file_path: "/project/.env" } }),
    env: { ATTEST_POLICY_MODE: "ENFORCE" },
  });
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  const parsed = JSON.parse(r.stdout.trim());
  assert.equal(parsed.permission, "deny");
  assert.match(parsed.agent_message, /41-env-write-forbidden/);
});

test("attest-mcp-policy evaluate --kind=mcp is wired (reserved)", () => {
  const r = runPolicyBin(["evaluate", "--kind=mcp"], {
    stdin: JSON.stringify({ server: "example", tool: "ping" }),
    env: { ATTEST_POLICY_MODE: "LOG_ONLY" },
  });
  assert.equal(r.status, 0);
  const parsed = JSON.parse(r.stdout.trim());
  assert.equal(parsed.continue, true);
  // LOG_ONLY: effective allow regardless of the underlying decision.
  assert.equal(parsed.permission, "allow");
});

test("attest-mcp-policy evaluate rejects an unknown --kind", () => {
  const r = runPolicyBin(["evaluate", "--kind=bogus"], {
    stdin: JSON.stringify({}),
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /--kind/);
});

test("attest-mcp-policy evaluate --kind=shell with OFF mode short-circuits allow", () => {
  const r = runPolicyBin(["evaluate", "--kind=shell"], {
    stdin: JSON.stringify({ command: "rm -rf /tmp/x" }),
    env: { ATTEST_POLICY_MODE: "OFF" },
  });
  assert.equal(r.status, 0);
  const parsed = JSON.parse(r.stdout.trim());
  assert.equal(parsed.permission, "allow");
});

test("attest-mcp policy --kind=shell subcommand is the fallback shape", () => {
  // Mirrors the sibling cursor-build-target hook script's fallback:
  //   printf '%s' "$input" | attest-mcp policy --kind=shell
  const r = runMainBin(["policy", "--kind=shell"], {
    stdin: JSON.stringify({ command: "git log" }),
    env: { ATTEST_POLICY_MODE: "ENFORCE" },
  });
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  const parsed = JSON.parse(r.stdout.trim());
  assert.equal(parsed.continue, true);
  assert.equal(parsed.permission, "allow");
});

test("attest-mcp --help advertises workspace-install only (no registry suggestions)", () => {
  const r = runMainBin(["--help"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /npm install/);
  assert.match(r.stdout, /bmatthews-dexcom\/attest/);
  assert.doesNotMatch(r.stdout, /npm i -g|npx -y/);
});
