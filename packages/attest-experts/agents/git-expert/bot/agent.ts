// TODO Phase 2: full persona port + eval
// Source: agents/git-expert.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "git-expert",
  "source": "agents/git-expert.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "Senior git & forge expert — repo bootstrap, feature branches, releases, history forensics, recovery, multi-remote sync. Six modes — `--init` bootstrap repo, `--feature` daily flow with atomic commits and draft PR, `--…"
};

export default defineStubExpert(META);
