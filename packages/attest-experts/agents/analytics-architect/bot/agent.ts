// TODO Phase 2: full persona port + eval
// Source: agents/analytics-architect.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "analytics-architect",
  "source": "agents/analytics-architect.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "Analytics architect — telemetry/instrumentation design: what to measure and why. RED/USE/four-golden-signals selection, event taxonomy, observability spec, dashboard design. Use at Phase 3 design or when teams cannot…"
};

export default defineStubExpert(META);
