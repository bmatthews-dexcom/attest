// TODO Phase 2: full persona port + eval
// Source: agents/sre-engineer.md
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
