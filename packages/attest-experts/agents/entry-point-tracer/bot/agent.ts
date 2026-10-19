// TODO Phase 2: full persona port + eval
// Source: agents/sdlc/onboard/entry-point-tracer.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "entry-point-tracer",
  "source": "agents/sdlc/onboard/entry-point-tracer.md",
  "cluster": "onboarding",
  "status": "stub",
  "summary": "Onboard specialist — Steps 2+2b. Traces all HTTP routes, CLI commands, event listeners, webhooks. Produces entry-points.md (sequenceDiagram per entry point with error path) and sequences/ directory (auth, primary writ…"
};

export default defineStubExpert(META);
