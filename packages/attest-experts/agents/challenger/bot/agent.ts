// TODO Phase 2: full persona port + eval
// Source: agents/challenger.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "challenger",
  "source": "agents/challenger.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "Veracity challenger — challenges factual claims in high-stakes artifacts (security findings, research reports, design docs, gate decisions) with evidence-only verdicts: CONFIRMED / CONTRADICTED / UNVERIFIABLE. Runs af…"
};

export default defineStubExpert(META);
