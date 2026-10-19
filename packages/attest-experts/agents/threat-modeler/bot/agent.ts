// TODO Phase 2: full persona port + eval
// Source: agents/security/threat-modeler.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "threat-modeler",
  "source": "agents/security/threat-modeler.md",
  "cluster": "security",
  "status": "stub",
  "summary": "Threat modeling specialist — STRIDE per component, DFD with trust boundaries, threat rating, and mitigation mapping. Produces THREAT_MODEL.md. Runs after semgrep-runner so it can reference confirmed findings when rati…"
};

export default defineStubExpert(META);
