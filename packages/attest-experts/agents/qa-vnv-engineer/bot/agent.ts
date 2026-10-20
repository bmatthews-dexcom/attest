// Shape C — sandbox-required BDK agent (stub pending full persona port + eval)
// Attest source: agents/qa-vnv-engineer.md
// Classification rationale: WRITE-SCOPE explicitly includes e2e/** durable suite — write:fs to repo source.
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "qa-vnv-engineer",
  "source": "agents/qa-vnv-engineer.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "QA & V&V (Verification and Validation) specialist — the end-user-testing discipline owner. Builds durable, automated, EVIDENCE-producing validation of the real rendered app: programmatic layout-defect detection (panel…"
};

export default defineStubExpert(META);
