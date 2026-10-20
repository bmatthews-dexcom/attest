// Shape C — sandbox-required BDK agent (stub pending full persona port + eval)
// Attest source: agents/release-manager.md
// Classification rationale: Chief-architecture doc Section 4 names release-manager as the sole holder of shell:destructive at phase 5 — version bump touches package.json even if it delegates publish steps.
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "release-manager",
  "source": "agents/release-manager.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "Release manager — thin coordinator for shipping a release: version bump, changelog assembly, tag, deploy-gate checklist, both-remotes push. Sequences git-expert, changelog-writer, and the validators; owns the release…"
};

export default defineStubExpert(META);
