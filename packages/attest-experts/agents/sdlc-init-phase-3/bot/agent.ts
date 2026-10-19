// TODO Phase 2: full persona port + eval
// Source: agents/sdlc-init-phase-3.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "sdlc-init-phase-3",
  "source": "agents/sdlc-init-phase-3.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "Mode 1 — Phase 3 & 3.5: Design and Test Design. Architecture, DB, API, security, infrastructure, test design. Loaded on demand by sdlc-init-mode.md when entering Phase 3."
};

export default defineStubExpert(META);
