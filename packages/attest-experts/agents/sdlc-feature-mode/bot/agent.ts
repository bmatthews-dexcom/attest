// TODO Phase 2: full persona port + eval
// Source: agents/sdlc-feature-mode.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "sdlc-feature-mode",
  "source": "agents/sdlc-feature-mode.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "Mode 3 — Add a feature to an existing system. Impact analysis, optional sub-component decomposition, design, implementation, parallel review + runtime + merge. Invoked by sdlc-lead when the user runs `/sdlc feature \"<…"
};

export default defineStubExpert(META);
