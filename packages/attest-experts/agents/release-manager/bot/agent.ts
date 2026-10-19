// TODO Phase 2: full persona port + eval
// Source: agents/release-manager.md
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
