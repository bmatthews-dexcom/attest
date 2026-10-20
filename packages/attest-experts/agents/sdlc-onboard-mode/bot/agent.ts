// TODO Phase 2: full persona port + eval
// Source: agents/sdlc-onboard-mode.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "sdlc-onboard-mode",
  "source": "agents/sdlc-onboard-mode.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "Mode 2 — Onboard to an existing codebase. Reverse-engineers a project into LANDSCAPE, entry-point diagrams, ERD, C2/C3 architecture, health assessment, and ONBOARDING guide. Dispatches 4 specialist sub-agents: landsca…"
};

export default defineStubExpert(META);
