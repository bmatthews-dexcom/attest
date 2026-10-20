/**
 * experts/ported.ts — single source of truth for which attest primary
 * experts have been **ported** to the sibling `attest-experts`
 * BDK pack as concrete agents (not Phase-2 stubs that only expose
 * `refuse-not-ported`).
 *
 * Two inputs, in order of precedence:
 *
 *   1. `ATTEST_EXPERTS_MANIFEST` env var — absolute path to a
 *      `experts.generated.json`-shaped file. Used by evals / tests that
 *      want to inject a different ported set without touching source.
 *   2. `packages/attest-experts/lib/experts.generated.json` resolved
 *      against `attestRoot()` (the live attest checkout when `ATTEST_ROOT`
 *      is set, otherwise the bundled copy that attest-mcp ships). Ported
 *      ids are those with `status === "concrete"`.
 *   3. Hardcoded fallback — the Phase-1 three (`security-auditor`,
 *      `code-reviewer`, `landscape-mapper`). Used when attest-mcp runs
 *      from its published tarball with no sibling attest-experts checkout
 *      visible on disk.
 *
 * Keep this set and `packages/attest-experts/lib/expert-registry.ts`'s
 * `CONCRETE_EXPERTS` in sync when porting a new expert — the file-read
 * path (2) picks up the change automatically for dev / integration
 * environments; the hardcode (3) is the stable default once attest-mcp
 * is published.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { attestRoot } from "../sources.js";

/**
 * The Phase-1 three concrete attest-experts BDK agents. Mirrors
 * `CONCRETE_EXPERTS` in `packages/attest-experts/lib/expert-registry.ts`.
 */
export const PORTED_EXPERT_IDS_FALLBACK: ReadonlySet<string> = new Set([
  "security-auditor",
  "code-reviewer",
  "landscape-mapper",
]);

export interface PortedExpertsSource {
  readonly origin: "env" | "manifest" | "fallback";
  readonly path?: string;
  readonly ids: ReadonlySet<string>;
}

interface ManifestEntry {
  readonly id?: unknown;
  readonly status?: unknown;
}

function parseManifest(absPath: string): ReadonlySet<string> | null {
  try {
    const text = readFileSync(absPath, "utf8");
    const data = JSON.parse(text) as unknown;
    if (!Array.isArray(data)) return null;
    const ids = new Set<string>();
    for (const row of data as ManifestEntry[]) {
      if (
        row &&
        typeof row === "object" &&
        typeof row.id === "string" &&
        row.status === "concrete"
      ) {
        ids.add(row.id);
      }
    }
    return ids;
  } catch {
    return null;
  }
}

let cached: PortedExpertsSource | null = null;

/**
 * Resolve the ported-experts source once per process. Reads env /
 * manifest at first call; subsequent calls return the cached result.
 */
export function portedExpertsSource(): PortedExpertsSource {
  if (cached) return cached;

  const envPath = process.env.ATTEST_EXPERTS_MANIFEST;
  if (envPath && envPath.trim()) {
    const abs = resolve(envPath.trim());
    if (existsSync(abs)) {
      const ids = parseManifest(abs);
      if (ids) {
        cached = { origin: "env", path: abs, ids };
        return cached;
      }
    }
  }

  // Walk from the resolved attest checkout; in the monorepo this is the
  // repo root (ATTEST_ROOT) and the manifest sits at
  // packages/attest-experts/lib/experts.generated.json. The bundled copy
  // packaged with attest-mcp intentionally does not ship the manifest, so
  // this read fails cleanly for published-package consumers and the
  // hardcoded fallback below takes over.
  try {
    const root = attestRoot().root;
    const manifestPath = resolve(
      root,
      "packages",
      "attest-experts",
      "lib",
      "experts.generated.json",
    );
    if (existsSync(manifestPath)) {
      const ids = parseManifest(manifestPath);
      if (ids) {
        cached = { origin: "manifest", path: manifestPath, ids };
        return cached;
      }
    }
  } catch {
    // attestRoot() can throw when neither ATTEST_ROOT nor a bundled copy
    // exists; that is a configuration error for the server as a whole and
    // the hardcoded fallback below is the right behaviour for callers
    // that only need `ported` information (e.g. a test harness).
  }

  cached = {
    origin: "fallback",
    ids: PORTED_EXPERT_IDS_FALLBACK,
  };
  return cached;
}

/** True when `id` names an attest-experts concrete agent. */
export function isPorted(id: string): boolean {
  return portedExpertsSource().ids.has(id);
}

/**
 * Test helper — clear the module-level cache so subsequent calls re-read
 * env / manifest. Not advertised as a public API.
 */
export function __resetPortedExpertsCacheForTesting(): void {
  cached = null;
}
