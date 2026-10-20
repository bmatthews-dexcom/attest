// TODO Phase 2: full persona port + eval
// Source: agents/app-cartographer.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "app-cartographer",
  "source": "agents/app-cartographer.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "End-user guide specialist — builds the page-graph state inventory and the per-state interactive-element inventory of a running app, the double denominator every other guide artifact is graded against. Runs first in th…"
};

export default defineStubExpert(META);
