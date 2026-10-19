// TODO Phase 2: full persona port + eval
// Source: agents/sdlc-init-phases-3-4.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "sdlc-init-phases-3-4",
  "source": "agents/sdlc-init-phases-3-4.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "SUPERSEDED — do not load. Split into sdlc-init-phase-3.md (Phases 3+3.5) and sdlc-init-phase-4.md (Phases 4+5). sdlc-init-mode.md already references the split files. Retained for doc references only."
};

export default defineStubExpert(META);
