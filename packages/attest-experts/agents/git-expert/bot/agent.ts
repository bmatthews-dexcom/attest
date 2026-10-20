// Shape C — sandbox-required BDK agent (stub pending full persona port + eval)
// Attest source: agents/git-expert.md
// Classification rationale: Six modes include --init bootstrap, --feature push+PR, --release tag+push, --sync multi-remote mirror — core git:write + pr:open.
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
