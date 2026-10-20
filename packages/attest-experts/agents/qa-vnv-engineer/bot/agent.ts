// TODO Phase 2: full persona port + eval
// Source: agents/qa-vnv-engineer.md
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
