// Proximity check tests. See docs §4.7.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PROXIMITY_DEFAULTS,
  jaccard,
  runProximityCheck,
  tokenize,
} from "../src/proximity/check.ts";

test("tokenize strips stopwords, lowercases, drops punctuation", () => {
  const bag = tokenize("The Release Notes Writer!");
  assert.ok(bag.has("release"));
  assert.ok(bag.has("notes"));
  assert.ok(bag.has("writer"));
  assert.ok(!bag.has("the"));
});

test("jaccard returns 0 for disjoint, 1 for identical sets", () => {
  assert.equal(jaccard(new Set(["a"]), new Set(["b"])), 0);
  assert.equal(jaccard(new Set(["a", "b"]), new Set(["a", "b"])), 1);
});

test("safely-new verdict when catalog is empty", () => {
  const res = runProximityCheck(
    {
      role: "release-notes-writer",
      mission: "Author release notes.",
      responsibilities: ["collect prs", "classify them", "render markdown"],
    },
    [],
    "fp-1",
  );
  assert.equal(res.verdict, "safely-new");
  assert.deepEqual(res.topMatches, []);
});

test("rename-and-dispatch when a catalog entry is extremely close", () => {
  const brief = {
    role: "release-notes-writer",
    mission: "Author release notes from merged pull requests.",
    responsibilities: ["collect merged prs", "classify prs", "render markdown"],
  };
  const catalog = [
    {
      expertId: "release-notes-writer",
      mission: "Author release notes from merged pull requests.",
      responsibilitiesText: "collect merged prs classify prs render markdown",
    },
  ];
  // Force a very low surface threshold so this specific test hits auto-dispatch.
  const res = runProximityCheck(brief, catalog, "fp-x", {
    ...PROXIMITY_DEFAULTS,
    autoDispatchThreshold: 0.5,
    surfaceThreshold: 0.3,
    safelyNewThreshold: 0.1,
  });
  assert.equal(res.verdict, "rename-and-dispatch");
});

test("refuse-rejected-earlier verdict when fingerprint is in reject log", () => {
  const res = runProximityCheck(
    {
      role: "release-notes-writer",
      mission: "Author release notes.",
      responsibilities: ["collect prs", "classify them", "render markdown"],
    },
    [],
    "fp-rejected",
    {
      ...PROXIMITY_DEFAULTS,
      rejectedFingerprints: new Set(["fp-rejected"]),
    },
  );
  assert.equal(res.verdict, "refuse-rejected-earlier");
  assert.equal(res.rejectionFingerprint, "fp-rejected");
});

test("surface-near-match verdict in the 0.60–0.78 band", () => {
  const brief = {
    role: "pr-labeller",
    mission: "Label pull requests based on diff heuristics.",
    responsibilities: ["read diff", "pick label", "post label"],
  };
  const catalog = [
    {
      expertId: "pr-triager",
      mission: "Triage pull requests and attach a priority label.",
      responsibilitiesText: "read diff pick label review",
    },
  ];
  const res = runProximityCheck(brief, catalog, "fp-y", {
    autoDispatchThreshold: 0.95,
    surfaceThreshold: 0.75,
    safelyNewThreshold: 0.2,
    rejectedFingerprints: new Set(),
  });
  // Jaccard will land somewhere between 0.2 and 0.75 for this pair.
  assert.equal(res.verdict, "surface-near-match");
});
