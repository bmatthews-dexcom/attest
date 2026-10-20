// TODO Phase 2: full persona port + eval
// Source: agents/sdlc-init-mode.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "sdlc-init-mode",
  "source": "agents/sdlc-init-mode.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "Mode 1 — New Project. Phases 0-5: ideation, planning, requirements, design, implementation, release. Invoked by sdlc-lead when the user runs `/sdlc init`."
};

export default defineStubExpert(META);
