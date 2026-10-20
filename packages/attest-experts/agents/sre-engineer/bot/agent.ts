// Shape C — sandbox-required BDK agent (stub pending full persona port + eval)
// Attest source: agents/sre-engineer.md
// Classification rationale: Writes CI/CD pipelines (.github/workflows/*.yml) and deploy strategies — write:fs to repo source.
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "sre-engineer",
  "source": "agents/sre-engineer.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "Senior SRE — runbooks, CI/CD pipelines, monitoring, incident response, deployment strategies. Use for operational concerns (deploy, monitor, respond to incidents). NOT for container/image building — use container-ops…"
};

export default defineStubExpert(META);
