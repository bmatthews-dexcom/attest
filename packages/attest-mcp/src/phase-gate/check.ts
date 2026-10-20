/**
 * phase-gate/check.ts — the `phase_gate_check` MCP tool.
 *
 * Given a current phase and intended next phase, decide whether the
 * transition is allowed and what blocks it. Classes of blockers:
 *   1. Unknown-phase arguments
 *   2. Transition not in the state machine
 *   3. Target phase's prerequisite receipt missing or wrong-phase
 *   4. Required files for the target phase missing
 *   5. Validators in the target phase's gate that aren't passing right now
 *
 * We intentionally do NOT run every validator synchronously here (phase-5
 * alone chains 16, and some are slow). Instead we:
 *   - Verify prereq receipts and required files cheaply (file reads)
 *   - Report which validators WOULD run so the caller can invoke them via
 *     the per-validator MCP tools
 *   - Offer a `runValidators: true` arg for callers that want full checking
 *     in one call (used in tests / CI-style flows)
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  effectiveValidators,
  phaseById,
  PhaseId,
  PHASES,
} from "./state-machine.js";
import {
  listValidators,
  ValidatorDescriptor,
} from "../validators/catalog.js";
import { runValidator } from "../validators/run.js";

export interface PhaseGateCheckArgs {
  readonly currentPhase: string;
  readonly nextPhase: string;
  readonly projectRoot?: string;
  readonly runValidators?: boolean;
}

export interface Blocker {
  readonly kind:
    | "unknown-phase"
    | "disallowed-transition"
    | "missing-prereq-receipt"
    | "stale-prereq-receipt"
    | "missing-required-file"
    | "validator-not-passing";
  readonly detail: string;
}

export interface PhaseGateCheckResult {
  readonly ok: boolean;
  readonly transition: {
    readonly from: string;
    readonly to: string;
    readonly allowed: boolean;
  };
  readonly projectRoot: string;
  readonly blockers: Blocker[];
  /**
   * Validators that the target phase's gate chains. Present even when the
   * check is cheap (`runValidators: false`) so the caller knows what to run
   * next.
   */
  readonly plannedValidators: string[];
  /**
   * Per-validator pass/fail, only when `runValidators: true` was requested.
   */
  readonly validatorResults?: Array<{
    readonly id: string;
    readonly ok: boolean;
    readonly exitCode: number;
    readonly gaps: number;
  }>;
}

function resolveProjectRoot(explicit?: string): string {
  const root = explicit || process.env.ATTEST_TARGET_ROOT || process.cwd();
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`projectRoot does not exist: ${root}`);
  }
  return root;
}

function resolveAlternates(root: string, entry: string): string {
  if (!entry.includes("|")) return entry;
  const alts = entry.split("|");
  for (const a of alts) if (existsSync(join(root, a))) return a;
  return alts[0];
}

function receiptForPhase(root: string, phase: PhaseId): string | null {
  const path = join(root, "docs", "work", "gates", `${phase}-receipt.json`);
  return existsSync(path) ? path : null;
}

function validatorByScriptName(
  scriptName: string,
): ValidatorDescriptor | undefined {
  const id = scriptName.replace(/^validate-/, "").replace(/\.sh$/, "");
  return listValidators().find((v) => v.id === id);
}

export async function phaseGateCheck(
  args: PhaseGateCheckArgs,
): Promise<PhaseGateCheckResult> {
  const projectRoot = resolveProjectRoot(args.projectRoot);
  const current = phaseById(args.currentPhase);
  const next = phaseById(args.nextPhase);

  const blockers: Blocker[] = [];

  if (!current) {
    blockers.push({
      kind: "unknown-phase",
      detail: `currentPhase "${args.currentPhase}" is not a known phase; valid: ${PHASES.map((p) => p.id).join(", ")}`,
    });
  }
  if (!next) {
    blockers.push({
      kind: "unknown-phase",
      detail: `nextPhase "${args.nextPhase}" is not a known phase; valid: ${PHASES.map((p) => p.id).join(", ")}`,
    });
  }

  if (!current || !next) {
    return {
      ok: false,
      transition: {
        from: args.currentPhase,
        to: args.nextPhase,
        allowed: false,
      },
      projectRoot,
      blockers,
      plannedValidators: [],
    };
  }

  // A "same-phase re-run" is allowed (common in iterative gate checking).
  // A transition is otherwise valid iff next.prerequisite === current.id OR
  // next is one of the standalone modes (prerequisite === null).
  const sameRun = current.id === next.id;
  const allowed =
    sameRun ||
    next.prerequisite === current.id ||
    next.prerequisite === null;

  if (!allowed) {
    blockers.push({
      kind: "disallowed-transition",
      detail:
        `phase ${current.id} -> ${next.id} is not an allowed transition; ` +
        `next.prerequisite = ${next.prerequisite ?? "(standalone)"}`,
    });
  }

  // Prereq receipt check (only when the next phase actually declares one).
  if (next.prerequisite) {
    const path = receiptForPhase(projectRoot, next.prerequisite);
    if (!path) {
      blockers.push({
        kind: "missing-prereq-receipt",
        detail: `no docs/work/gates/${next.prerequisite}-receipt.json — run \`validate_phase_gate\` for ${next.prerequisite} (or the dedicated phase_gate_check) first`,
      });
    } else {
      try {
        const text = readFileSync(path, "utf8");
        const receipt = JSON.parse(text);
        if (receipt?.phase && receipt.phase !== next.prerequisite) {
          blockers.push({
            kind: "stale-prereq-receipt",
            detail: `${path} records phase=${receipt.phase}, expected ${next.prerequisite}`,
          });
        }
      } catch (err) {
        blockers.push({
          kind: "stale-prereq-receipt",
          detail: `could not parse ${path}: ${(err as Error).message}`,
        });
      }
    }
  }

  // Required files for the target phase.
  for (const entry of next.requiredFiles) {
    const chosen = resolveAlternates(projectRoot, entry);
    const abs = join(projectRoot, chosen);
    if (!existsSync(abs) || statSync(abs).size === 0) {
      blockers.push({
        kind: "missing-required-file",
        detail: `${chosen} missing or empty`,
      });
    }
  }

  const plannedValidators = effectiveValidators(next);

  let validatorResults: PhaseGateCheckResult["validatorResults"];
  if (args.runValidators) {
    validatorResults = [];
    for (const script of plannedValidators) {
      const descriptor = validatorByScriptName(script);
      if (!descriptor) {
        // validate-challenger-gate.sh IS in the catalog; a missing one means
        // the planned script was excluded (phase-gate.sh / helpers). Record
        // a soft blocker but don't crash.
        blockers.push({
          kind: "validator-not-passing",
          detail: `${script} is not exposed as an MCP tool (helper or orchestrator); run it via the shell orchestrator`,
        });
        continue;
      }
      const result = await runValidator(descriptor, { projectRoot });
      const row = {
        id: descriptor.id,
        ok: result.ok,
        exitCode: result.exitCode,
        gaps: result.envelope?.gaps ?? result.findings.length,
      };
      validatorResults.push(row);
      if (!row.ok) {
        blockers.push({
          kind: "validator-not-passing",
          detail: `${descriptor.id} failed (exit ${row.exitCode}, ${row.gaps} gap(s))`,
        });
      }
    }
  }

  const ok = allowed && blockers.length === 0;

  return {
    ok,
    transition: { from: current.id, to: next.id, allowed },
    projectRoot,
    blockers,
    plannedValidators,
    validatorResults,
  };
}
