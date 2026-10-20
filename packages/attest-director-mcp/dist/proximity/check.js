const PROXIMITY_DEFAULTS = {
  autoDispatchThreshold: 0.9,
  surfaceThreshold: 0.78,
  safelyNewThreshold: 0.6,
  rejectedFingerprints: /* @__PURE__ */ new Set()
};
function runProximityCheck(brief, catalog, fingerprint, options = PROXIMITY_DEFAULTS) {
  if (options.rejectedFingerprints.has(fingerprint)) {
    return {
      topMatches: [],
      verdict: "refuse-rejected-earlier",
      rejectionFingerprint: fingerprint
    };
  }
  const briefTokens = tokenize([brief.role, brief.mission, ...brief.responsibilities].join(" "));
  const scored = catalog.map((entry) => {
    const entryTokens = tokenize(
      [entry.expertId, entry.mission, entry.responsibilitiesText ?? ""].join(" ")
    );
    const score = jaccard(briefTokens, entryTokens);
    return {
      expertId: entry.expertId,
      score,
      rationale: `jaccard-overlap=${score.toFixed(2)} on mission + role tokens`
    };
  }).sort((a, b) => b.score - a.score);
  const topMatches = scored.slice(0, 3).filter((m) => m.score >= options.surfaceThreshold);
  const top = scored[0]?.score ?? 0;
  if (top >= options.autoDispatchThreshold) {
    return {
      topMatches,
      verdict: "rename-and-dispatch"
    };
  }
  if (top >= options.surfaceThreshold) {
    return {
      topMatches,
      verdict: "rename-and-create"
    };
  }
  if (top < options.safelyNewThreshold) {
    return {
      topMatches: [],
      verdict: "safely-new"
    };
  }
  return {
    topMatches: scored.slice(0, 3),
    verdict: "surface-near-match"
  };
}
function tokenize(s) {
  const bag = /* @__PURE__ */ new Set();
  const normalized = s.toLowerCase().replace(/[^a-z0-9\s-]/g, " ");
  for (const word of normalized.split(/\s+/)) {
    const w = word.trim();
    if (w.length < 2) continue;
    if (STOPWORDS.has(w)) continue;
    bag.add(w);
  }
  return bag;
}
const STOPWORDS = /* @__PURE__ */ new Set([
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
  "works"
]);
function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  if (union === 0) return 0;
  return inter / union;
}
export {
  PROXIMITY_DEFAULTS,
  jaccard,
  runProximityCheck,
  tokenize
};
//# sourceMappingURL=check.js.map
