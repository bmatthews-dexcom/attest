// TODO Phase 2: full persona port + eval
// Source: agents/manual-writer.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "manual-writer",
  "source": "agents/manual-writer.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "End-user guide specialist — assembles the Diátaxis-shaped user manual from app-cartographer''s APP_MAP.md/STORIES.md, guide-scribe''s specs and gated screenshots, and an end-user-simulator UAT tour. Runs last in the M…"
};

export default defineStubExpert(META);
