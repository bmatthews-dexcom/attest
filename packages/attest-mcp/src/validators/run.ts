/**
 * validators/run.ts — invoke an attest validator shell script and capture its
 * structured result.
 *
 * Contract (per scripts/validators/README.md and _lib.sh):
 *   - Validators take an optional [project-root] arg (defaults to pwd).
 *   - Clean stdout is a single JSON envelope:
 *       {"validator":"<name>","gaps":N,"exit":0|1,"items":[...]}
 *   - Human text is on stderr.
 *   - Exit 0 clean / 1 gaps / 2 validator error.
 *
 * We layer two more guarantees on top of that:
 *   - Default working directory is the caller's project root (ATTEST_TARGET_ROOT
 *     env or the process cwd), NOT the attest checkout, so running a validator
 *     against the user's repo Just Works.
 *   - All child-process stdin is closed so a validator that accidentally reads
 *     stdin can never block the server.
 *   - Telemetry writes inside _lib.sh go into the TARGET repo's docs/work/,
 *     not into the attest-mcp install location — the target-root argument we
 *     pass is used by $ROOT in _lib.sh.
 *   - EXPERTS_TELEMETRY=0 is forwarded unless the caller flipped it on
 *     explicitly, so an MCP tool call never silently writes to the user's
 *     repo.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { ValidatorDescriptor } from "./catalog.js";

export interface ValidatorRunArgs {
  /**
   * Repo to validate. Falls back to ATTEST_TARGET_ROOT, then process.cwd().
   */
  readonly projectRoot?: string;
  /**
   * Hard cap in milliseconds. Default 2 minutes — most validators finish in
   * under a second; the slow ones (build, tests, security) can take longer
   * but ought to time out before they wedge the MCP server forever.
   */
  readonly timeoutMs?: number;
  /**
   * Forward EXPERTS_TELEMETRY if true. Default false — don't write telemetry
   * from inside an MCP call unless the caller asked for it.
   */
  readonly enableTelemetry?: boolean;
  /**
   * Extra env vars to pass through to the shell script. The validator layer
   * does not define any; this is an escape hatch for forward compatibility.
   */
  readonly env?: Record<string, string>;
}

export interface ValidatorFinding {
  readonly category: string;
  readonly detail: string;
}

export interface ValidatorRunResult {
  readonly ok: boolean;
  readonly validator: string;
  readonly exitCode: number;
  /**
   * The JSON envelope parsed from stdout. `null` only when the validator
   * errored before emitting it (exitCode === 2 or a non-zero code with
   * unparseable stdout).
   */
  readonly envelope: {
    readonly validator: string;
    readonly gaps: number;
    readonly exit: number;
    readonly items: ValidatorFinding[];
  } | null;
  readonly findings: ValidatorFinding[];
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly runtimeMs: number;
  readonly projectRoot: string;
}

const DEFAULT_TIMEOUT_MS = 120_000;

function resolveProjectRoot(explicit?: string): string {
  const candidate = explicit || process.env.ATTEST_TARGET_ROOT || process.cwd();
  if (!existsSync(candidate)) {
    throw new Error(`projectRoot does not exist: ${candidate}`);
  }
  return candidate;
}

export async function runValidator(
  descriptor: ValidatorDescriptor,
  args: ValidatorRunArgs = {},
): Promise<ValidatorRunResult> {
  const projectRoot = resolveProjectRoot(args.projectRoot);
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const start = Date.now();

  return await new Promise<ValidatorRunResult>((resolve, reject) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...args.env,
      // Point _lib.sh's detect_project_root at the target repo and tell its
      // telemetry writer to stay silent unless explicitly turned on.
      PROJECT_ROOT: projectRoot,
      EXPERTS_TELEMETRY: args.enableTelemetry ? "1" : "0",
    };

    const child = spawn("bash", [descriptor.scriptPath, projectRoot], {
      cwd: projectRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 500).unref();
      } catch {
        /* already gone */
      }
    }, timeoutMs);
    timer.unref();

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const exitCode = typeof code === "number" ? code : -1;

      let envelope: ValidatorRunResult["envelope"] = null;
      let findings: ValidatorFinding[] = [];

      // The validator envelope is the last JSON object printed to stdout.
      // Some validators emit `pass`-style notes to stderr (expected) but
      // stdout should contain exactly one JSON line. If a validator ever
      // decides to emit multiple JSON lines, we take the last.
      const match = stdout.match(/\{[\s\S]*\}\s*$/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          if (
            parsed &&
            typeof parsed === "object" &&
            typeof parsed.validator === "string"
          ) {
            envelope = {
              validator: parsed.validator,
              gaps: Number(parsed.gaps) || 0,
              exit: Number(parsed.exit) || 0,
              items: Array.isArray(parsed.items) ? parsed.items : [],
            };
            findings = envelope.items;
          }
        } catch {
          /* fall through — envelope stays null */
        }
      }

      resolve({
        ok: exitCode === 0 && !timedOut,
        validator: descriptor.id,
        exitCode,
        envelope,
        findings,
        stdout,
        stderr,
        timedOut,
        runtimeMs: Date.now() - start,
        projectRoot,
      });
    });
  });
}
