#!/usr/bin/env node
/**
 * Pack-wide smoke verification. Runs the key-free checks and reports pass /
 * fail for each. Full evals require a Cursor API key (`bdk login` /
 * `CURSOR_API_KEY`) and are run separately via `npm run eval`.
 *
 * Steps:
 *   1. `bdk validate` the whole multi-agent dir — every agent must be clean.
 *   2. For each concrete expert, `bdk call submit-report` with a fixture to
 *      prove the schema validates and the write hits ctx.host.files/kv.
 *   3. For a sample of stubs, `bdk call refuse-not-ported` to prove the
 *      refusal path works.
 *   4. Smoke-test the stub MCP server over stdio (initialize + tools/list).
 */
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, "..");
const BDK = resolve(PKG, "..", "..", "node_modules", ".bin", "bdk");

const CONCRETE = [
  "security-auditor",
  "code-reviewer",
  "landscape-mapper",
  // Phase 2 — security cluster wave.
  "semgrep-runner",
  "secrets-scanner",
  "dependency-auditor",
  "owasp-web-checker",
  "threat-modeler",
];
// Sample stubs for the refusal smoke step. Picked to avoid colliding with any
// cluster currently being promoted (attack-chainer is the deferred security
// synthesizer; dead-code-detector and component-mapper remain stubs today).
const SAMPLE_STUBS = ["attack-chainer", "dead-code-detector", "component-mapper"];
const STUB_SERVER = resolve(PKG, "lib", "stub-mcp-server.mjs");

const fixtureReport = (id) => ({
  task_id: `T-SMOKE-${id.toUpperCase()}-1`,
  findings: [
    {
      id: `${id.slice(0, 3).toUpperCase()}-001`,
      severity: "medium",
      title: `smoke fixture finding for ${id}`,
      evidence: "lib/example.ts:1 (fixture)",
    },
  ],
  blockers: [],
  artifacts: [],
  done: true,
  summary: `validate-all fixture for ${id}`,
});

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  return { ok: r.status === 0, stdout: r.stdout, stderr: r.stderr, status: r.status };
}

async function stepValidateAll() {
  const r = sh(BDK, ["validate", "--dir", resolve(PKG, "agents")], { cwd: PKG });
  const lines = (r.stdout + r.stderr).split("\n").filter(Boolean);
  const bad = lines.filter((l) => l.startsWith("error:") || l.includes("failed"));
  return { ok: r.ok && bad.length === 0, detail: `${lines.length} agents checked; ${bad.length} errors`, raw: r };
}

async function stepCallConcrete(id) {
  const r = sh(BDK, [
    "call",
    "submit-report",
    "--dir",
    resolve(PKG, "agents", id),
    "--input",
    JSON.stringify(fixtureReport(id)),
  ], { cwd: PKG });
  const match = r.stdout.includes(`"expert_id": "${id}"`) && r.stdout.includes(`"ok": true`);
  return { ok: r.ok && match, detail: match ? "schema-validated write" : r.stdout.slice(0, 200) };
}

async function stepCallStub(id) {
  const r = sh(BDK, [
    "call",
    "refuse-not-ported",
    "--dir",
    resolve(PKG, "agents", id),
    "--input",
    JSON.stringify({ task_id: `T-STUB-${id.toUpperCase()}` }),
  ], { cwd: PKG });
  const match = r.stdout.includes(`"status": "not_ported"`) && r.stdout.includes(`"expert_id": "${id}"`);
  return { ok: r.ok && match, detail: match ? "refused as expected" : r.stdout.slice(0, 200) };
}

async function stepStubMcp() {
  return new Promise((resolveP) => {
    const child = spawn(process.execPath, [STUB_SERVER], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (b) => (out += b.toString()));
    child.stdin.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "0" } },
      }) + "\n",
    );
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) + "\n");
    setTimeout(() => {
      child.kill();
      const names = ["get_persona", "run_validator", "list_validators", "get_expert_manifest", "get_protocol"];
      const matched = names.filter((n) => out.includes(`"name":"${n}"`));
      resolveP({ ok: matched.length === names.length, detail: `${matched.length}/${names.length} stub tools advertised` });
    }, 1500);
  });
}

const steps = [
  ["validate all 84 agents", stepValidateAll],
  ...CONCRETE.map((id) => [`call submit-report on ${id}`, () => stepCallConcrete(id)]),
  ...SAMPLE_STUBS.map((id) => [`call refuse-not-ported on ${id}`, () => stepCallStub(id)]),
  ["stub MCP server initialize + tools/list", stepStubMcp],
];

let failed = 0;
for (const [name, fn] of steps) {
  const { ok, detail } = await fn();
  const mark = ok ? "ok  " : "FAIL";
  console.log(`[${mark}] ${name} — ${detail}`);
  if (!ok) failed += 1;
}

console.log("");
if (failed) {
  console.error(`validate-all: ${failed} step(s) failed`);
  process.exit(1);
} else {
  console.log(`validate-all: all ${steps.length} key-free steps passed`);
}
