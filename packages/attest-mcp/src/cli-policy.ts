#!/usr/bin/env node
/**
 * cli-policy.ts — the `attest-mcp-policy` bin.
 *
 * Shape-C policy evaluator for Cursor hook scripts. Spoken by the sibling
 * cursor-build-target generator (`.cursor/hooks/evaluate-shell-policy.sh`,
 * `.cursor/hooks/evaluate-write-policy.sh`; the planned
 * `evaluate-mcp-policy.sh` once Cursor exposes `beforeMcpInvoke`):
 *
 *   printf '%s' "$input" | attest-mcp-policy evaluate --kind=shell
 *
 * The sibling cursor-build-target worker's hook scripts resolve the
 * engine in this strict order (per bmatthews-dexcom's local-only
 * install contract — no registry fetches, ever):
 *
 *   1. `attest-mcp-policy evaluate --kind=<kind>`  (this bin)
 *   2. `attest-mcp policy --kind=<kind>`          (main CLI subcommand)
 *   3. hard fail with a "run scripts/local-install.sh" message
 *
 * ── Contract ───────────────────────────────────────────────────────────
 * stdin:  Cursor hook JSON for the matching kind.
 * stdout: Cursor hook decision JSON — exactly one line, no trailing
 *         whitespace beyond the final newline.
 * exit:   0 on any clean decision (even "deny" — a deny is a successful
 *         evaluation that returned deny). Non-zero exit means ENGINE
 *         ERROR; the hook script applies its own fail-closed /
 *         LOG_ONLY fallback.
 *
 * Environment variables:
 *   ATTEST_POLICY_MODE          OFF | LOG_ONLY | ENFORCE (default: ENFORCE)
 *   ATTEST_POLICY_AUDIT_LOG     JSONL audit path (default: ./audit/policy.jsonl)
 *   ATTEST_POLICY_EXPERT_ID     Expert id attributed to hook calls
 *                               (default: "editor-agent")
 *   ATTEST_POLICY_CLUSTER       Expert cluster for the policy context
 *                               (default: "editor")
 *   ATTEST_POLICY_PHASE         SDLC phase id (default: "unknown")
 *   ATTEST_POLICY_TASK_ID       Short-form task id (optional)
 *   ATTEST_AUTONOMY_MODE        interactive | auto (default: interactive)
 *   ATTEST_POLICY_BUNDLE_DIR    Override the Cedar bundle directory
 *                               (default: dist/policy/ next to this file)
 *
 * This package is LOCAL-ONLY. If this bin is not on PATH, install the
 * workspace from the user's personal GitHub clone:
 *
 *   cd <path-to-attest> && npm install
 *
 * There is no `npm i -g` and no `npx -y` support by design.
 */

import { evaluateHookJson, type PolicyKind } from "./policy/hooks.js";

export async function runPolicyCli(args: readonly string[]): Promise<number> {
  // Preferred shape: `attest-mcp-policy evaluate --kind=<shell|write|mcp>`
  // Shortcut shape (bare, as used by the main-CLI subcommand):
  //   `attest-mcp policy --kind=<kind>` → args = ["--kind=<kind>"]
  const rest = args[0] === "evaluate" ? args.slice(1) : args;

  if (rest.length === 0 || rest.includes("--help") || rest.includes("-h")) {
    writeStderr(POLICY_CLI_HELP);
    return 2;
  }

  const kind = extractKind(rest);
  if (!kind) {
    writeStderr(
      "attest-mcp-policy: missing --kind=<shell|write|mcp>.\n" +
        "Install the workspace locally (`cd <path-to-attest> && npm install`)\n" +
        "or pass --help for usage.\n",
    );
    return 2;
  }

  let input: Record<string, unknown>;
  try {
    input = await readJsonStdin();
  } catch (err) {
    writeStderr(
      `attest-mcp-policy: could not read Cursor hook JSON from stdin: ${
        (err as Error).message
      }\n`,
    );
    return 3;
  }

  try {
    const { cursor } = evaluateHookJson(kind, input, {});
    process.stdout.write(JSON.stringify(cursor) + "\n");
    return 0;
  } catch (err) {
    writeStderr(
      `attest-mcp-policy: engine error (kind=${kind}): ${(err as Error).message}\n`,
    );
    return 4;
  }
}

function extractKind(args: readonly string[]): PolicyKind | null {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--kind" && i + 1 < args.length) {
      return normaliseKind(args[i + 1]);
    }
    if (a.startsWith("--kind=")) {
      return normaliseKind(a.slice("--kind=".length));
    }
  }
  return null;
}

function normaliseKind(raw: string): PolicyKind | null {
  const v = raw.trim().toLowerCase();
  if (v === "shell" || v === "write" || v === "mcp") return v;
  return null;
}

async function readJsonStdin(): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  // Allow a hook invocation with no stdin (empty object fallback) only when
  // stdin is a TTY; otherwise read to EOF.
  if (process.stdin.isTTY) return {};
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (raw.length === 0) return {};
  const parsed = JSON.parse(raw) as unknown;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      "expected a JSON object on stdin (got " +
        (parsed === null ? "null" : Array.isArray(parsed) ? "array" : typeof parsed) +
        ")",
    );
  }
  return parsed as Record<string, unknown>;
}

function writeStderr(text: string): void {
  try {
    process.stderr.write(text);
  } catch {
    /* best-effort */
  }
}

const POLICY_CLI_HELP = [
  "attest-mcp-policy — Shape-C policy evaluator for Cursor hook scripts.",
  "",
  "This bin is part of the local-only @bpmforge/attest-mcp workspace.",
  "If it is not on PATH, install the workspace from the user's personal",
  "GitHub clone of bmatthews-dexcom/attest:",
  "",
  "    cd <path-to-attest>",
  "    npm install              # workspace install at repo root",
  "    # then re-run the hook script, or add",
  "    #   <repo>/packages/attest-mcp/dist to PATH.",
  "",
  "The package is NEVER fetched from the public npm registry; no global",
  "install path is supported. Install from the local workspace only.",
  "",
  "Usage:",
  "    attest-mcp-policy evaluate --kind=<shell|write|mcp> < hook.json",
  "",
  "Contract:",
  "    stdin   Cursor hook JSON (beforeShellExecution, preToolUse Write/Edit,",
  "            or the planned beforeMcpInvoke mirror).",
  "    stdout  Cursor hook decision JSON:",
  "              {\"continue\":true,\"permission\":\"allow\"|\"deny\",",
  "               \"user_message\":\"...\",\"agent_message\":\"...\"}",
  "    exit 0  Clean decision (allow OR deny — both are successful",
  "            evaluations).",
  "    exit !0 Engine error. The hook script applies its own fail-closed",
  "            / LOG_ONLY fallback (see .cursor/hooks/evaluate-*-policy.sh).",
  "",
  "Environment variables:",
  "    ATTEST_POLICY_MODE        OFF | LOG_ONLY | ENFORCE (default ENFORCE)",
  "    ATTEST_POLICY_AUDIT_LOG   JSONL audit path (default ./audit/policy.jsonl)",
  "    ATTEST_POLICY_EXPERT_ID   expert id attributed to hook calls",
  "    ATTEST_POLICY_CLUSTER     expert cluster for the policy context",
  "    ATTEST_POLICY_PHASE       SDLC phase id (default: unknown)",
  "    ATTEST_AUTONOMY_MODE      interactive | auto (default: interactive)",
  "",
].join("\n");

async function main(): Promise<void> {
  const exit = await runPolicyCli(process.argv.slice(2));
  process.exit(exit);
}

const isDirectRun =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  (process.argv[1].endsWith("/cli-policy.js") ||
    process.argv[1].endsWith("\\cli-policy.js") ||
    /attest-mcp-policy(\.js)?$/.test(process.argv[1]));

if (isDirectRun) {
  main().catch((err) => {
    process.stderr.write(
      `attest-mcp-policy: fatal: ${
        err instanceof Error ? err.stack ?? err.message : String(err)
      }\n`,
    );
    process.exit(1);
  });
}
