// TODO Phase 2: full persona port + eval
// Source: agents/sdlc-init-phases-0-2.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "sdlc-init-phases-0-2",
  "source": "agents/sdlc-init-phases-0-2.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "Mode 1 phase files — Phases 0-2: Ideation, Planning, Requirements. Loaded on demand by sdlc-init-mode.md dispatcher when entering Phase 0, 1, or 2."
};

export default defineStubExpert(META);
