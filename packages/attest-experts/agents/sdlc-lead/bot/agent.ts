// TODO Phase 2: full persona port + eval
// Source: agents/sdlc-lead.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "sdlc-lead",
  "source": "agents/sdlc-lead.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "Program manager and lead architect — orchestrates the full software development lifecycle. Use for new projects (/sdlc init), understanding existing codebases (/sdlc onboard), adding features (/sdlc feature), or impro…"
};

export default defineStubExpert(META);
