// TODO Phase 2: full persona port + eval
// Source: agents/guide-scribe.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "guide-scribe",
  "source": "agents/guide-scribe.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "End-user guide specialist — the capture engine. Turns app-cartographer''s STORIES.md into replayable JSON step specs, executes them, captures gated annotated screenshots, and triages errors as bug/documented-error/sus…"
};

export default defineStubExpert(META);
