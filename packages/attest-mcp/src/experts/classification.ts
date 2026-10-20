/**
 * experts/classification.ts — load the sibling attest-experts Shape-C
 * classification manifest and expose it as a typed accessor.
 *
 * The authoritative source lives in the sibling repo at
 * `packages/attest-experts/lib/classification.generated.json`
 * (produced by `packages/attest-experts/scripts/sync-classification.ts`
 * on PR #12 — `feat/shape-c-attest-experts`). We vendor a snapshot into
 * `src/experts/classification.generated.json` so this package stays
 * standalone-buildable; the build script re-copies that file into
 * `dist/experts/` at pack time.
 *
 * Refresh procedure when the sibling file changes:
 *   cp ../attest-experts/lib/classification.generated.json \
 *      packages/attest-mcp/src/experts/classification.generated.json
 *   npm run build && npm test
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = resolve(HERE, "classification.generated.json");

export type Classification = "sandbox-required" | "in-process-eligible" | "stub";

export interface ClassifiedCapability {
  readonly kind: string;
  readonly scope?: string;
}

export interface ClassifiedExpert {
  readonly cluster: string;
  readonly classification: Classification;
  readonly requiredCapabilities: readonly ClassifiedCapability[];
  readonly rationale: string;
  readonly sourceFile: string;
}

export interface ClassificationSummary {
  readonly rubric: Record<Classification, string>;
  readonly total: number;
  readonly byClassification: Record<Classification, number>;
  readonly byClusterByClassification: Record<string, Record<string, number>>;
  readonly inProcessEligibleKeptAsSandbox: readonly string[];
}

export interface ClassificationManifest {
  readonly summary: ClassificationSummary;
  readonly experts: ReadonlyMap<string, ClassifiedExpert>;
}

let cached: ClassificationManifest | null = null;

export function resetClassificationCache(): void {
  cached = null;
}

export function loadClassificationManifest(): ClassificationManifest {
  if (cached) return cached;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `attest-mcp classification manifest: failed to read ${MANIFEST_PATH} ` +
        `(${(err as Error).message}). Re-copy the sibling manifest from ` +
        `packages/attest-experts/lib/classification.generated.json.`,
    );
  }
  const summary = raw._summary as ClassificationSummary | undefined;
  if (!summary || typeof summary !== "object") {
    throw new Error(
      `attest-mcp classification manifest at ${MANIFEST_PATH} is missing _summary`,
    );
  }
  const experts = new Map<string, ClassifiedExpert>();
  for (const [key, value] of Object.entries(raw)) {
    if (key === "_summary") continue;
    if (!value || typeof value !== "object") continue;
    experts.set(key, value as ClassifiedExpert);
  }
  cached = { summary, experts };
  return cached;
}

export function classifiedExpert(id: string): ClassifiedExpert | undefined {
  return loadClassificationManifest().experts.get(id);
}

export function inProcessEligibleKeptAsSandbox(): readonly string[] {
  return loadClassificationManifest().summary.inProcessEligibleKeptAsSandbox;
}
