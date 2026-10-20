/**
 * sources.ts — resolve where to read attest source material from at runtime.
 *
 * Precedence:
 *   1. ATTEST_ROOT env var — a live attest checkout. Required for development
 *      and for anyone running against an unreleased version of attest's rules
 *      or validators.
 *   2. The ./bundled/ tree shipped inside the installed attest-mcp
 *      package (populated by scripts/bundle-sources.mjs at prepack time).
 *
 * Every subsystem (validators/, phase-gate/, routing/, protocols/, prompts/)
 * uses the single `attestRoot()` returned here instead of resolving paths
 * ad-hoc.
 */

import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// src/sources.ts is compiled to dist/sources.js — bundled/ sits next to dist/.
const PACKAGE_ROOT = resolve(HERE, "..");
const BUNDLED_ROOT = resolve(PACKAGE_ROOT, "bundled");

export interface SourceRoots {
  /** Absolute directory containing scripts/, rules/, agents/, commands/. */
  readonly root: string;
  /** Which mechanism won: env override or bundled copy. */
  readonly origin: "env" | "bundled";
}

let cached: SourceRoots | null = null;

function hasAttestShape(dir: string): boolean {
  return (
    existsSync(resolve(dir, "scripts", "validators")) &&
    existsSync(resolve(dir, "rules")) &&
    existsSync(resolve(dir, "agents"))
  );
}

export function attestRoot(): SourceRoots {
  if (cached) return cached;

  const envRoot = process.env.ATTEST_ROOT;
  if (envRoot && envRoot.trim()) {
    const abs = resolve(envRoot);
    if (!existsSync(abs) || !statSync(abs).isDirectory()) {
      throw new Error(
        `ATTEST_ROOT=${envRoot} is not an existing directory`,
      );
    }
    if (!hasAttestShape(abs)) {
      throw new Error(
        `ATTEST_ROOT=${envRoot} does not look like an attest checkout ` +
          `(missing scripts/validators/, rules/, or agents/)`,
      );
    }
    cached = { root: abs, origin: "env" };
    return cached;
  }

  if (hasAttestShape(BUNDLED_ROOT)) {
    cached = { root: BUNDLED_ROOT, origin: "bundled" };
    return cached;
  }

  throw new Error(
    "No attest sources found. Either set ATTEST_ROOT to a local attest " +
      "checkout, or install attest-mcp with its bundled copy " +
      "(run `npm run build` which invokes scripts/bundle-sources.mjs).",
  );
}

export function resolveFromRoot(...parts: string[]): string {
  return resolve(attestRoot().root, ...parts);
}
