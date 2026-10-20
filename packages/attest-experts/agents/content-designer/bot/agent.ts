// TODO Phase 2: full persona port + eval
// Source: agents/content-designer.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "content-designer",
  "source": "agents/content-designer.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "Content design specialist — writes the actual UI text (labels, empty states, error messages, confirmations, onboarding copy) as a reviewable spec before implementation. Runs at SDLC Phase 3.5 (Design Loop), alongside…"
};

export default defineStubExpert(META);
