// TODO Phase 2: full persona port + eval
// Source: agents/sdlc/onboard/health-coordinator.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "health-coordinator",
  "source": "agents/sdlc/onboard/health-coordinator.md",
  "cluster": "onboarding",
  "status": "stub",
  "summary": "Onboard specialist — Step 6. Orchestrates all health reviews (code quality, security, test coverage, performance, UX) and synthesizes HEALTH_ASSESSMENT.md. Also produces USE_CASES.md from existing codebase and dispatc…"
};

export default defineStubExpert(META);
