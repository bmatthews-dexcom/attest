// TODO Phase 2: full persona port + eval
// Source: agents/documentation-gap-finder.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "documentation-gap-finder",
  "source": "agents/documentation-gap-finder.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "Documentation gap finder — scans source exports against existing docs, lists undocumented public functions/classes/API endpoints, stale doc references, and coverage percentage. Proactive: before a public release or wh…"
};

export default defineStubExpert(META);
