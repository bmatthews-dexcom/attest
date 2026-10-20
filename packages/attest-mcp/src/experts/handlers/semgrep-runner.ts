/**
 * handlers/semgrep-runner.ts — reference in-process expert.
 *
 * Aligned with the sibling attest-experts classification manifest
 * (packages/attest-experts/lib/classification.generated.json, PR #12):
 *   id:              "semgrep-runner"
 *   cluster:         security
 *   classification:  in-process-eligible
 *   WRITE-SCOPE:     docs/security/
 *   note:            "Shape-C reference-handler candidate" (manifest rationale)
 *
 * Capability spectrum: `read:fs` + `shell:safe` (semgrep is a strictly
 * read-only SAST scanner — the handler never passes `--fix`). This is
 * the shell-bearing reference handler of the three shipped with Shape C,
 * replacing the earlier coverage-reporter which the sibling worker
 * flagged as not matching a real attest expert id and whose closest
 * matches were sandbox-required (qa-vnv-engineer, test-engineer).
 *
 * When `semgrep` is not on the PATH or an `ATTEST_SEMGREP_COMMAND`
 * override wasn't set, the handler falls back to `--runner mock` for
 * deterministic test runs. Live invocation always uses the explicitly
 * named command — no shell interpolation of untrusted strings.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type {
  ExpertFinding,
  ExpertInput,
  ExpertOutput,
  InProcessExpertHandler,
} from "../types.js";
import { getLlmBackend } from "./llm.js";

const DEFAULT_TIMEOUT_MS = 120_000;

interface CommandResult {
  readonly ok: boolean;
  readonly command: string;
  readonly args: readonly string[];
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly runtimeMs: number;
}

function runSafeCommand(command: string, args: string[], cwd: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<CommandResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const child = spawn(command, args, { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try {
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 500).unref();
      } catch {
        /* already gone */
      }
    }, timeoutMs);
    timer.unref();
    child.stdout.on("data", (d) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d) => (stderr += d.toString("utf8")));
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, command, args, stdout, stderr: `${stderr}\n${err.message}`, exitCode: -1, runtimeMs: Date.now() - start });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, command, args, stdout, stderr, exitCode: typeof code === "number" ? code : -1, runtimeMs: Date.now() - start });
    });
  });
}

interface Runner {
  readonly command: string;
  readonly args: string[];
  readonly source: "mock" | "env" | "path" | "project";
}

function pickRunner(root: string, override: unknown): Runner | null {
  if (override === "mock" || process.env.ATTEST_SEMGREP_FORCE_MOCK === "1") {
    return {
      command: "node",
      args: [
        "-e",
        'process.stdout.write(JSON.stringify({mock:true,results:[],errors:[],paths:{scanned:0}}))',
      ],
      source: "mock",
    };
  }
  const envCmd = process.env.ATTEST_SEMGREP_COMMAND;
  if (envCmd) {
    const parts = envCmd.split(/\s+/).filter(Boolean);
    return { command: parts[0], args: parts.slice(1), source: "env" };
  }
  // Prefer a project-local install.
  const localBin = join(root, "node_modules", ".bin", "semgrep");
  if (existsSync(localBin)) {
    return { command: localBin, args: ["--config=auto", "--json", "--quiet"], source: "project" };
  }
  // Fall back to the global PATH; `spawn` will fail if semgrep isn't installed.
  if (process.env.PATH && process.env.PATH.length) {
    return { command: "semgrep", args: ["--config=auto", "--json", "--quiet"], source: "path" };
  }
  return null;
}

interface SemgrepResult {
  readonly check_id?: string;
  readonly path?: string;
  readonly start?: { line?: number };
  readonly extra?: { severity?: string; message?: string };
}

export const semgrepRunnerHandler: InProcessExpertHandler = {
  id: "semgrep-runner",
  cluster: "security",
  persona: async () => {
    try {
      const { loadPersonaFromAttestSource } = await import("./persona.js");
      return await loadPersonaFromAttestSource("security/semgrep-runner");
    } catch {
      return (
        "You are semgrep-runner, an attest security specialist. You take a " +
        "semgrep JSON output + a target workspace path, triage each " +
        "finding by rule id and severity, and write a short report " +
        "naming the high-signal matches. You NEVER invoke semgrep with " +
        "--fix. Writes synthesis to docs/security/."
      );
    }
  },
  requiredCapabilities: [
    { kind: "read:fs" },
    { kind: "shell:safe", scope: "semgrep scan (no --fix)" },
  ],
  async invoke(input: ExpertInput): Promise<ExpertOutput> {
    const start = Date.now();
    const root = input.projectRoot || process.env.ATTEST_TARGET_ROOT || process.cwd();
    const runner = pickRunner(root, input.args?.runner);
    const findings: ExpertFinding[] = [];
    const data: Record<string, unknown> = { root };

    if (!runner) {
      findings.push({
        category: "semgrep:no-runner",
        severity: "medium",
        detail:
          "no semgrep runner found — install semgrep (project or PATH) or set ATTEST_SEMGREP_COMMAND",
      });
      return {
        ok: false,
        expertId: "semgrep-runner",
        summary: "no semgrep runner available",
        findings,
        data,
        runtimeMs: Date.now() - start,
      };
    }

    data.runner = `${runner.command} ${runner.args.join(" ")}`;
    data.runnerSource = runner.source;
    const cmd = await runSafeCommand(runner.command, runner.args, root);
    data.exitCode = cmd.exitCode;
    data.runtimeMs = cmd.runtimeMs;

    let semgrepFindings: SemgrepResult[] = [];
    if (cmd.stdout.trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(cmd.stdout) as { results?: SemgrepResult[]; errors?: unknown[] };
        semgrepFindings = Array.isArray(parsed.results) ? parsed.results : [];
        if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
          data.semgrepErrors = parsed.errors;
        }
      } catch {
        findings.push({
          category: "semgrep:parse-error",
          severity: "medium",
          detail: `could not parse semgrep JSON output (stdout tail: ${cmd.stdout.slice(-200)})`,
        });
      }
    } else if (!cmd.ok && runner.source !== "mock") {
      findings.push({
        category: "semgrep:runner-failed",
        severity: "high",
        detail: `semgrep exited ${cmd.exitCode}; stderr tail: ${cmd.stderr.slice(-200)}`,
      });
    }

    for (const f of semgrepFindings) {
      const severity = normaliseSeverity(f.extra?.severity);
      findings.push({
        category: `semgrep:${f.check_id ?? "unknown-rule"}`,
        severity,
        detail: f.extra?.message ?? `semgrep match ${f.check_id ?? "<rule>"}`,
        location: f.path && f.start?.line ? `${f.path}:${f.start.line}` : f.path,
      });
    }

    data.semgrepFindingCount = semgrepFindings.length;

    const llm = getLlmBackend();
    const persona =
      typeof semgrepRunnerHandler.persona === "string"
        ? semgrepRunnerHandler.persona
        : await semgrepRunnerHandler.persona();
    const llmResponse = await llm.complete({
      system: persona,
      user:
        `Goal: ${input.goal}\n\n` +
        `Workspace: ${root}\n` +
        `Runner: ${data.runner} (${runner.source})\n` +
        `Runner exit: ${cmd.exitCode}\n` +
        `Semgrep findings: ${semgrepFindings.length}\n` +
        `Sample finding (first): ${JSON.stringify(semgrepFindings[0] ?? null)}\n`,
    });
    data.llmBackend = llmResponse.backend;

    return {
      ok: findings.length === 0,
      expertId: "semgrep-runner",
      summary:
        semgrepFindings.length === 0
          ? "no semgrep findings"
          : `${semgrepFindings.length} semgrep finding(s)`,
      findings,
      data,
      transcript: llmResponse.transcript,
      runtimeMs: Date.now() - start,
    };
  },
};

function normaliseSeverity(raw: string | undefined): ExpertFinding["severity"] {
  if (!raw) return "info";
  const value = raw.trim().toUpperCase();
  if (value === "ERROR" || value === "CRITICAL") return "critical";
  if (value === "HIGH") return "high";
  if (value === "WARNING" || value === "MEDIUM") return "medium";
  if (value === "LOW") return "low";
  return "info";
}
