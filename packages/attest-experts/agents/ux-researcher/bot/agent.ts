// TODO Phase 2: full persona port + eval
// Source: agents/ux-researcher.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "ux-researcher",
  "source": "agents/ux-researcher.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "UX research specialist — turns personas and user stories into user-flow diagrams and a screen inventory, BEFORE any wireframe or token work starts. Runs at SDLC Phase 3.5 (Design Loop), after Phase 3 architecture and…"
};

export default defineStubExpert(META);
