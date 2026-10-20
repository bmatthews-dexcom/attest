/**
 * Proximity check — Phase 1 rename / cluster-recategorization sweep.
 *
 * Implements the close-match decision tree from
 * `docs/attest-director-architecture.md` §4.7.
 *
 * We deliberately do NOT ship a real embedding model: Director's Phase 1
 * runs this against the chief's own `attest-mcp.route_goal` surface in
 * production (same embedding stack). This file carries the decision tree
 * logic + a lexical fallback scorer so the Director MCP server can run its
 * tests without an external embedding call.
 */
import type { RoleBrief } from "../schema/role-brief.js";
import type { RoleBriefProximityCheck } from "../schema/role-brief.js";

export interface ExpertCatalogEntry {
  expertId: string;
  mission: string;
  responsibilitiesText?: string;
  capabilityTags?: string[];
}

export interface ProximityOptions {
  autoDispatchThreshold: number; // ≥ 0.90 — auto rename-and-dispatch
  surfaceThreshold: number;      // ≥ 0.78 — surface as near-match
  safelyNewThreshold: number;    // < 0.60 — safely new
  rejectedFingerprints: ReadonlySet<string>;
}

export const PROXIMITY_DEFAULTS: ProximityOptions = {
  autoDispatchThreshold: 0.9,
  surfaceThreshold: 0.78,
  safelyNewThreshold: 0.6,
  rejectedFingerprints: new Set<string>(),
};

/**
 * Compute the proximity check for a role brief against the known expert
 * catalog. The scorer is lexical (Jaccard over tokens of mission +
 * responsibilities + role name) — a stand-in for the real embedding
 * cosine the production Director uses via `attest-mcp.route_goal`.
 */
export function runProximityCheck(
  brief: Pick<RoleBrief, "role" | "mission" | "responsibilities">,
  catalog: readonly ExpertCatalogEntry[],
  fingerprint: string,
  options: ProximityOptions = PROXIMITY_DEFAULTS,
): RoleBriefProximityCheck {
  if (options.rejectedFingerprints.has(fingerprint)) {
    return {
      topMatches: [],
      verdict: "refuse-rejected-earlier",
      rejectionFingerprint: fingerprint,
    };
  }

  const briefTokens = tokenize([brief.role, brief.mission, ...brief.responsibilities].join(" "));

  const scored = catalog
    .map((entry) => {
      const entryTokens = tokenize(
        [entry.expertId, entry.mission, entry.responsibilitiesText ?? ""].join(" "),
      );
      const score = jaccard(briefTokens, entryTokens);
      return {
        expertId: entry.expertId,
        score,
        rationale: `jaccard-overlap=${score.toFixed(2)} on mission + role tokens`,
      };
    })
    .sort((a, b) => b.score - a.score);

  const topMatches = scored.slice(0, 3).filter((m) => m.score >= options.surfaceThreshold);

  const top = scored[0]?.score ?? 0;

  if (top >= options.autoDispatchThreshold) {
    return {
      topMatches,
      verdict: "rename-and-dispatch",
    };
  }
  if (top >= options.surfaceThreshold) {
    return {
      topMatches,
      verdict: "rename-and-create",
    };
  }
  if (top < options.safelyNewThreshold) {
    return {
      topMatches: [],
      verdict: "safely-new",
    };
  }
  // Between safely-new and surface — treat as surface-near-match (sits in
  // the 0.60–0.78 band).
  return {
    topMatches: scored.slice(0, 3),
    verdict: "surface-near-match",
  };
}

export function tokenize(s: string): Set<string> {
  const bag = new Set<string>();
  const normalized = s.toLowerCase().replace(/[^a-z0-9\s-]/g, " ");
  for (const word of normalized.split(/\s+/)) {
    const w = word.trim();
    if (w.length < 2) continue;
    if (STOPWORDS.has(w)) continue;
    bag.add(w);
  }
  return bag;
}

const STOPWORDS = new Set([
  "the",
  "and",
  "or",
  "a",
  "an",
  "to",
  "for",
  "of",
  "in",
  "on",
  "with",
  "by",
  "is",
  "are",
  "be",
  "that",
  "this",
  "it",
  "as",
  "at",
  "from",
  "into",
  "about",
  "role",
  "expert",
  "task",
  "tasks",
  "work",
  "works",
]);

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  if (union === 0) return 0;
  return inter / union;
}
