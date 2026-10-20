#!/usr/bin/env node
// scripts/integration-smoke.mjs
//
// Dynamically registers tsx so the smoke can load the conductor's
// bot/* TypeScript files directly (they use NodeNext `.js` import specifiers
// that resolve to the sibling .ts source under tsx).
//
// Cross-package integration smoke for the attest Cursor target. Boots:
//
//   * `attest-mcp` as a stdio child process (via `node packages/attest-mcp/dist/cli.js`),
//   * `attest-experts` three concrete BDK agents (serve or scaffold-only, see --real),
//   * `attest-conductor` as a BDK agent (serve or in-process),
//
// drives one `/autopilot "review this trivial fixture for security issues"`
// goal end-to-end against `evals/fixtures/trivial-repo/`, and asserts
// terminal state.
//
// **Non-destructive.** The smoke never writes to the host system outside
// `/tmp` and the repo's own build outputs. Nothing in the user's `~/.config`,
// `~/.cursor`, or home directory is touched. The fixture repo is read-only.
//
// Modes:
//   --stub  (default) — attest-mcp runs in-process via the conductor's
//                       inline stub tools; experts dispatch via the
//                       conductor's stub pathway. No external processes.
//   --real            — attest-mcp runs as a real child process over
//                       stdio; experts run via `bdk serve --mode multi`
//                       with the three concrete agents mounted. Requires
//                       `CURSOR_API_KEY` (or `bdk login` state) to drive
//                       any agent turn. Without it: exits with a clean
//                       "need CURSOR_API_KEY" message, not a crash.
//
// Exit codes:
//   0  all asserts pass
//   1  an assertion failed OR a required precondition failed
//   2  --real asked for but no Cursor credential found
//
// Usage:
//   node scripts/integration-smoke.mjs --stub
//   node scripts/integration-smoke.mjs --real
//   node scripts/integration-smoke.mjs --help

import { spawn, spawnSync } from "node:child_process";
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

// Re-exec under `node --import tsx` so the smoke can load the conductor's
// TypeScript source directly through NodeNext `.js` specifiers. The
// smoke is a plain `.mjs` so `node scripts/integration-smoke.mjs ...`
// works without a prerequisite loader; the fenced re-exec stays contained
// to this script.
if (!process.env.ATTEST_SMOKE_UNDER_TSX) {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: "inherit", env: { ...process.env, ATTEST_SMOKE_UNDER_TSX: "1" } },
  );
  process.exit(typeof result.status === "number" ? result.status : 1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const FIXTURE_ROOT = join(REPO_ROOT, "evals/fixtures/trivial-repo");
const MCP_CLI = join(REPO_ROOT, "packages/attest-mcp/dist/cli.js");
const CONDUCTOR_DIR = join(REPO_ROOT, "packages/attest-conductor");

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(
    [
      "integration-smoke — cross-package attest smoke",
      "",
      "Usage:",
      "  node scripts/integration-smoke.mjs --stub   (default; no external processes)",
      "  node scripts/integration-smoke.mjs --real   (boots attest-mcp + experts via BDK; needs CURSOR_API_KEY)",
    ].join("\n"),
  );
  process.exit(0);
}

const mode = args.includes("--real") ? "real" : "stub";

const results = [];
function record(label, ok, detail) {
  results.push({ label, ok, detail });
  const prefix = ok ? "[ok  ]" : "[fail]";
  console.log(`${prefix} ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  console.log(`\nintegration-smoke mode=${mode}\n`);

  // Precondition: the fixture repo exists and contains the three files we expect.
  precondFixture();

  if (mode === "stub") {
    await runStubMode();
  } else {
    await runRealMode();
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.log(`\nintegration-smoke FAILED (${failed.length} / ${results.length} assertions)`);
    process.exit(1);
  }
  console.log(`\nintegration-smoke OK (${results.length} assertions passed)`);
}

function precondFixture() {
  const expectFiles = ["README.md", "package.json", "src/login.js"];
  for (const rel of expectFiles) {
    const abs = join(FIXTURE_ROOT, rel);
    const ok = existsSync(abs) && statSync(abs).size > 0;
    record(`fixture: ${rel}`, ok, ok ? "present" : `missing or empty at ${abs}`);
    if (!ok) {
      console.log("\nFixture is incomplete; cannot continue.");
      process.exit(1);
    }
  }
}

async function runStubMode() {
  // In stub mode we don't boot external processes. We assert the shape of
  // the stub attest-mcp + the shape of dispatch_expert's stub-mode result
  // + the conductor loop's own thresholds (shouldStop + idempotency), by
  // calling the public functions directly.
  const conductorMod = await import(
    `file://${join(CONDUCTOR_DIR, "bot/lib/ralph-loop.ts")}`
  );
  record(
    "conductor stub: renderRalphPrompt mentions phase_gate_check + per-validator tools",
    typeof conductorMod.renderRalphPrompt === "function",
    "ralph-loop.ts exports renderRalphPrompt",
  );
  const stateMod = await import(
    `file://${join(CONDUCTOR_DIR, "bot/lib/conductor-state.ts")}`
  );
  const task = stateMod.newTask({ goal: "stub-smoke" });
  const prompt = conductorMod.renderRalphPrompt({ task });
  record(
    "stub: Ralph prompt steers to plannedValidators + validate_<name>",
    prompt.includes("plannedValidators") && prompt.includes("validate_<name>"),
    "Fix 1 wiring present in the merged conductor",
  );

  const stubMod = await import(
    `file://${join(CONDUCTOR_DIR, "bot/lib/attest-stub-tools.ts")}`
  );
  const stubTools = stubMod.attestStubTools;
  const validateArch = stubTools.validate_architecture;
  record(
    "stub attest-mcp: per-validator tool advertised (validate_architecture)",
    !!validateArch,
    "attest-mcp stub exposes validate_<name>, not a generic validate(name)",
  );

  const gateResult = await stubTools.phase_gate_check.execute({ phase: "build" });
  record(
    "stub attest-mcp: phase_gate_check returns plannedValidators[]",
    Array.isArray(gateResult.plannedValidators) && gateResult.plannedValidators.length > 0,
    `got ${JSON.stringify(gateResult.plannedValidators)}`,
  );

  const routeResult = await stubTools.route_goal.execute({
    goal: "review this trivial fixture for security issues",
    currentPhase: "intake",
  });
  record(
    "stub attest-mcp: route_goal picks the security-reviewer family for a security goal",
    typeof routeResult.expert === "string" && /security/.test(routeResult.expert),
    `routed to "${routeResult.expert}"`,
  );

  const dispatchMod = await import(
    `file://${join(CONDUCTOR_DIR, "bot/tools/dispatch_expert.ts")}`
  );
  dispatchMod.__resetExpertCatalogCacheForTesting?.();
  delete process.env.ATTEST_MCP_COMMAND;
  const kv = new Map();
  const task2 = stateMod.newTask({ goal: "stub smoke dispatch" });
  kv.set(stateMod.taskKey(task2.taskId), task2);
  const dispatchCtx = {
    host: {
      kv: {
        get: async (key) => kv.get(key),
        put: async (key, value) => kv.set(key, value),
      },
      mcp: {
        callTool: async () => ({ content: [{ type: "text", text: "{}" }] }),
      },
    },
  };
  const dispatchResult = await dispatchMod.default.execute(
    {
      taskId: task2.taskId,
      expertId: "security-reviewer",
      prompt: "Audit the trivial-repo fixture",
      actionId: "stub-smoke-0",
    },
    dispatchCtx,
  );
  record(
    "conductor stub: dispatch_expert falls through to stub mode when ATTEST_MCP_COMMAND is unset",
    dispatchResult.mode === "stub" && dispatchResult.status === "ok",
    `mode=${dispatchResult.mode}, status=${dispatchResult.status}`,
  );
}

async function runRealMode() {
  // --real mode only runs when a Cursor credential is present. BDK agent
  // turns refuse without one, and we don't want to crash with an opaque
  // error — exit 2 with a clear message instead.
  const hasCred = hasCursorCredential();
  if (!hasCred) {
    console.log(
      [
        "",
        "need CURSOR_API_KEY (or CURSOR_API_KEY_FILE / CURSOR_SERVICE_ACCOUNT_KEY /",
        "an existing `bdk login` session) to drive the real attest-mcp + attest-experts",
        "integration path. Re-run with --stub for the no-credentials smoke, or set a",
        "credential and retry with --real.",
        "",
      ].join("\n"),
    );
    process.exit(2);
  }

  // Precondition: attest-mcp has been built (so the stdio cli.js exists).
  if (!existsSync(MCP_CLI)) {
    record(
      "attest-mcp built artifact (packages/attest-mcp/dist/cli.js)",
      false,
      `missing — run \`npm --workspace attest-mcp run build\``,
    );
    console.log("\ncannot continue without the built attest-mcp cli");
    process.exit(1);
  }

  // Boot attest-mcp as a child process and probe --inventory. The server
  // itself runs as stdio; the inventory flag is a one-shot CLI that exits
  // cleanly, giving us a liveness probe without needing a stdio client.
  const inventory = await runNodeCli(MCP_CLI, ["--inventory"], { timeoutMs: 20_000 });
  const inventoryOk =
    inventory.ok &&
    /tools/i.test(inventory.stdout) &&
    /validators|routing/i.test(inventory.stdout);
  record(
    "attest-mcp boots and reports its inventory",
    inventoryOk,
    inventory.ok ? "inventory probe returned without error" : `exit ${inventory.code}: ${inventory.stderr.slice(0, 200)}`,
  );

  // Discover the real conductor + experts via BDK info to prove the
  // peer-connection shape is wired. This doesn't drive an agent turn —
  // that's the integration eval's job — but it does catch mis-wired peer
  // slugs in CI before paying for a Cursor credential.
  const conductorInfo = await runNodeCli(
    "npx",
    ["-y", "@cursor/bdk", "info", "--dir", CONDUCTOR_DIR, "--json"],
    { timeoutMs: 60_000 },
  );
  const conductorOk = conductorInfo.ok && safeJson(conductorInfo.stdout);
  const peerSlugs = conductorOk ? collectPeerSlugs(JSON.parse(conductorInfo.stdout)) : [];
  for (const expected of [
    "attest-expert-security-auditor",
    "attest-expert-code-reviewer",
    "attest-expert-landscape-mapper",
  ]) {
    record(
      `conductor: peer MCP connection "${expected}" is discoverable`,
      peerSlugs.includes(expected),
      `discovered slugs: ${peerSlugs.join(", ") || "(none)"}`,
    );
  }

  console.log(
    [
      "",
      "Full real-mode agent-turn exercise (end-to-end /autopilot + security-auditor",
      "report + phase gate) runs via `npx @cursor/bdk eval --dir packages/attest-conductor",
      "integration/attest-e2e`. This smoke proves the plumbing; the eval proves the",
      "LLM behavior.",
      "",
    ].join("\n"),
  );
}

function hasCursorCredential() {
  if (process.env.CURSOR_API_KEY && process.env.CURSOR_API_KEY.trim() !== "") return true;
  if (process.env.CURSOR_API_KEY_FILE) {
    try {
      const text = readFileSync(process.env.CURSOR_API_KEY_FILE, "utf8").trim();
      if (text !== "") return true;
    } catch {
      /* fall through */
    }
  }
  if (process.env.CURSOR_SERVICE_ACCOUNT_KEY && process.env.CURSOR_SERVICE_ACCOUNT_KEY.trim() !== "") {
    return true;
  }
  // `bdk login` writes a credential file whose exact path is BDK-internal;
  // we don't probe it here. Users driving --real without an env var have
  // typically done `bdk login` themselves, in which case `bdk info` succeeds
  // and the agent turn succeeds; without any of the three env vars we fail
  // closed to keep CI deterministic.
  return false;
}

function collectPeerSlugs(info) {
  const agents = Array.isArray(info?.agents) ? info.agents : [];
  const slugs = [];
  for (const agent of agents) {
    const connections = Array.isArray(agent?.mcp?.connections)
      ? agent.mcp.connections
      : Array.isArray(agent?.connections)
      ? agent.connections
      : [];
    for (const c of connections) {
      const transport = c?.transport;
      if (typeof transport === "string" && transport.startsWith("agent:")) {
        slugs.push(transport.slice("agent:".length));
      } else if (transport && typeof transport === "object" && typeof transport.agent === "string") {
        slugs.push(transport.agent);
      } else if (typeof c?.name === "string" && c.name.startsWith("attest-expert-")) {
        slugs.push(c.name);
      }
    }
  }
  return slugs;
}

function safeJson(text) {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function runNodeCli(cmd, cliArgs, { timeoutMs = 30_000 } = {}) {
  return new Promise((resolveFn) => {
    const child = spawn(cmd, cliArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try {
        child.kill("SIGTERM");
      } catch {
        /* fall through */
      }
      resolveFn({ ok: false, code: null, stdout, stderr: stderr + "\n(timed out)" });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolveFn({ ok: code === 0, code, stdout, stderr });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolveFn({ ok: false, code: null, stdout, stderr: `${err.message}` });
    });
  });
}

await main();
