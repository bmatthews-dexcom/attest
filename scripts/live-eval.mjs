#!/usr/bin/env node
// scripts/live-eval.mjs
//
// Live-eval runner — drives the single cross-package integration eval
// (`integration/attest-e2e`) against a locally booted `attest-mcp`
// child process, captures the full BDK eval transcript to a timestamped
// JSONL artifact, and prints a one-line pass/fail summary with the artifact
// path.
//
// This complements `scripts/integration-smoke.mjs`:
//
//   * `integration-smoke` proves the plumbing (processes boot, peer slugs
//     are discoverable, stub paths return the right shapes) WITHOUT paying
//     for a Cursor credential.
//   * `live-eval` proves the LLM behaviour. It needs a real credential and
//     a real network path to the Cursor models backend.
//
// Nothing in this script writes to the user's home, their .cursor, their
// npm global, or any production surface. The attest-mcp child process is
// local and dies with the parent; the eval runs in a sandboxed BDK
// workspace; the artifact lands under `artifacts/live-eval/` in the repo.
//
// Required env:
//   CURSOR_API_KEY   — Cursor API key for the BDK runtime (mandatory).
//
// Optional env:
//   LIVE_EVAL_CASE   — override the --case selector (default:
//                      `integration/attest-e2e`).
//   LIVE_EVAL_DIR    — override the --dir (default: packages/attest-conductor).
//   LIVE_EVAL_BDK    — override the BDK CLI invocation
//                      (default: `npx @cursor/bdk`).
//   LIVE_EVAL_SKIP_BUILD — set to "1" to skip the attest-mcp build check.
//
// Exit codes:
//   0  eval ran to completion and the terminal transcript line reports a
//      pass. The artifact path is printed.
//   1  eval ran but the terminal transcript reports a failure (or the BDK
//      CLI exited non-zero). The artifact path is printed.
//   2  prerequisite missing (CURSOR_API_KEY unset, attest-mcp not built,
//      conductor package missing, fixture missing). Nothing was run.
//
// Usage:
//   node scripts/live-eval.mjs
//   npm run live-eval
//   CURSOR_API_KEY=sk-... npm run live-eval

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, createWriteStream } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const DEFAULT_CONDUCTOR_DIR = join(REPO_ROOT, "packages/attest-conductor");
const DEFAULT_CASE = "integration/attest-e2e";
const MCP_CLI = join(REPO_ROOT, "packages/attest-mcp/dist/cli.js");
const ARTIFACT_DIR = join(REPO_ROOT, "artifacts/live-eval");

const args = process.argv.slice(2);
if (args.includes("-h") || args.includes("--help")) {
  printHelp();
  process.exit(0);
}

main().catch((err) => {
  console.error(`live-eval: unhandled error — ${err?.stack || err?.message || err}`);
  process.exit(1);
});

async function main() {
  const conductorDir = process.env.LIVE_EVAL_DIR
    ? resolve(process.env.LIVE_EVAL_DIR)
    : DEFAULT_CONDUCTOR_DIR;
  const caseSel = process.env.LIVE_EVAL_CASE || DEFAULT_CASE;

  requireCredential();
  requireFile(conductorDir, "conductor package", "packages/attest-conductor/");
  requireFile(join(conductorDir, "evals"), "conductor evals/", "run `bdk validate`");

  if (process.env.LIVE_EVAL_SKIP_BUILD !== "1") {
    requireFile(
      MCP_CLI,
      "attest-mcp built artifact",
      "run `npm --workspace attest-mcp run build`",
    );
  }

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const stamp = isoStamp();
  const artifactPath = join(ARTIFACT_DIR, `${stamp}.jsonl`);
  const artifactStream = createWriteStream(artifactPath, { flags: "a" });

  // Boot attest-mcp locally so the conductor's attest connection has a
  // real stdio server to talk to even without the published npm package
  // being on-path. We pass the executable path + args to BDK via
  // ATTEST_MCP_COMMAND / ATTEST_MCP_ARGS, which the conductor's
  // bot/mcp-connections/attest.ts respects.
  const mcpEnv = {
    ATTEST_MCP_COMMAND: process.execPath,
    ATTEST_MCP_ARGS: JSON.stringify([MCP_CLI]),
  };

  const bdkArgv = resolveBdkArgv();
  const evalArgs = [
    ...bdkArgv.slice(1),
    "eval",
    "--dir",
    conductorDir,
    "--case",
    caseSel,
  ];

  writeArtifactMeta(artifactStream, {
    event: "live-eval.start",
    stamp,
    case: caseSel,
    conductorDir,
    bdk: bdkArgv.join(" "),
    mcp: `${process.execPath} ${MCP_CLI}`,
  });

  console.log(`live-eval: case=${caseSel} artifact=${artifactPath}`);

  const summary = await runBdk(bdkArgv[0], evalArgs, mcpEnv, artifactStream);

  writeArtifactMeta(artifactStream, {
    event: "live-eval.end",
    exitCode: summary.code,
    passed: summary.passed,
    failed: summary.failed,
    verdict: summary.verdict,
  });

  await new Promise((finishResolve) => {
    artifactStream.end(finishResolve);
  });

  const headline = summary.verdict === "pass"
    ? `live-eval PASS (${summary.passed} assertion(s)) — artifact: ${artifactPath}`
    : summary.verdict === "fail"
    ? `live-eval FAIL (${summary.failed} failure(s), ${summary.passed} pass(es)) — artifact: ${artifactPath}`
    : `live-eval UNKNOWN (exit ${summary.code}, could not parse verdict) — artifact: ${artifactPath}`;
  console.log(headline);
  process.exit(summary.verdict === "pass" ? 0 : 1);
}

function requireCredential() {
  const key = (process.env.CURSOR_API_KEY || "").trim();
  if (!key) {
    console.error(
      [
        "live-eval: set CURSOR_API_KEY to run.",
        "",
        "The BDK runtime drives real Cursor model turns and refuses without a",
        "credential. Export CURSOR_API_KEY in the shell that runs this script,",
        "e.g.  export CURSOR_API_KEY=sk-...  — then re-run `npm run live-eval`.",
      ].join("\n"),
    );
    process.exit(2);
  }
}

function requireFile(path, label, remedy) {
  if (!existsSync(path)) {
    console.error(
      `live-eval: ${label} not found at ${path}. Remedy: ${remedy}.`,
    );
    process.exit(2);
  }
}

function resolveBdkArgv() {
  const override = process.env.LIVE_EVAL_BDK;
  if (override && override.trim() !== "") {
    const parts = override.trim().split(/\s+/);
    if (parts.length === 0) throw new Error("LIVE_EVAL_BDK is empty");
    return parts;
  }
  return ["npx", "@cursor/bdk"];
}

function isoStamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return [
    now.getUTCFullYear(),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
    "T",
    pad(now.getUTCHours()),
    pad(now.getUTCMinutes()),
    pad(now.getUTCSeconds()),
    "Z",
  ].join("");
}

function writeArtifactMeta(stream, record) {
  stream.write(JSON.stringify({ ts: new Date().toISOString(), ...record }) + "\n");
}

/**
 * Streams the BDK eval stdout/stderr both to the console (so humans can
 * watch) and to the JSONL artifact (so the full transcript lands on
 * disk). The verdict is parsed from the terminal lines.
 */
function runBdk(cmd, cliArgs, extraEnv, artifactStream) {
  return new Promise((resolveFn) => {
    const child = spawn(cmd, cliArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...extraEnv },
    });

    const summary = { code: null, passed: 0, failed: 0, verdict: "unknown" };
    const stdoutLines = [];
    const stderrLines = [];

    const forward = (chunk, stream, bucket, channel) => {
      const text = chunk.toString();
      process[stream].write(text);
      for (const line of text.split("\n")) {
        if (line === "") continue;
        bucket.push(line);
        artifactStream.write(
          JSON.stringify({ ts: new Date().toISOString(), channel, line }) + "\n",
        );
      }
    };

    child.stdout.on("data", (chunk) => forward(chunk, "stdout", stdoutLines, "stdout"));
    child.stderr.on("data", (chunk) => forward(chunk, "stderr", stderrLines, "stderr"));

    child.on("error", (err) => {
      summary.verdict = "unknown";
      summary.code = 127;
      artifactStream.write(
        JSON.stringify({
          ts: new Date().toISOString(),
          channel: "runner",
          event: "spawn.error",
          message: err.message,
        }) + "\n",
      );
      resolveFn(summary);
    });

    child.on("close", (code) => {
      summary.code = code;
      const parsed = parseVerdict([...stdoutLines, ...stderrLines]);
      summary.passed = parsed.passed;
      summary.failed = parsed.failed;
      if (parsed.verdict !== "unknown") {
        summary.verdict = parsed.verdict;
      } else {
        summary.verdict = code === 0 ? "pass" : "fail";
      }
      resolveFn(summary);
    });
  });
}

/**
 * Pulls counts out of BDK's terminal lines. BDK renders cases as
 * `✓ integration/attest-e2e` / `✗ integration/attest-e2e` and a summary
 * line of the shape `Passed: N` / `Failed: N`. We match defensively so a
 * rename of the renderer doesn't instantly break the runner.
 */
function parseVerdict(lines) {
  let passed = 0;
  let failed = 0;
  let hasAnyMark = false;
  const re = {
    passedLine: /Passed[^\d]+(\d+)/i,
    failedLine: /Failed[^\d]+(\d+)/i,
    checkmark: /^(?:[^\w]*)?(?:\u2713|OK|PASS|pass)[^\n]*(?:integration\/attest-e2e)/,
    cross: /^(?:[^\w]*)?(?:\u2717|FAIL|fail)[^\n]*(?:integration\/attest-e2e)/,
  };
  for (const line of lines) {
    const p = line.match(re.passedLine);
    if (p) passed = Math.max(passed, parseInt(p[1], 10) || 0);
    const f = line.match(re.failedLine);
    if (f) failed = Math.max(failed, parseInt(f[1], 10) || 0);
    if (re.checkmark.test(line)) {
      passed = Math.max(passed, 1);
      hasAnyMark = true;
    }
    if (re.cross.test(line)) {
      failed = Math.max(failed, 1);
      hasAnyMark = true;
    }
  }
  if (failed > 0) return { passed, failed, verdict: "fail" };
  if (passed > 0 || hasAnyMark) return { passed: Math.max(passed, 1), failed, verdict: "pass" };
  return { passed, failed, verdict: "unknown" };
}

function printHelp() {
  console.log(
    [
      "live-eval — run the attest cross-package integration eval against a live Cursor model.",
      "",
      "Usage:",
      "  node scripts/live-eval.mjs",
      "  npm run live-eval",
      "",
      "Env:",
      "  CURSOR_API_KEY         (required) — Cursor credential for the BDK runtime.",
      "  LIVE_EVAL_CASE         (optional) — override --case (default integration/attest-e2e).",
      "  LIVE_EVAL_DIR          (optional) — override --dir (default packages/attest-conductor).",
      "  LIVE_EVAL_BDK          (optional) — override BDK CLI (default `npx @cursor/bdk`).",
      "  LIVE_EVAL_SKIP_BUILD   (optional) — set to 1 to skip the attest-mcp build check.",
      "",
      "Exit codes:",
      "  0  pass",
      "  1  eval failure",
      "  2  prerequisite missing (no credential, missing build artifact, etc.)",
    ].join("\n"),
  );
}
