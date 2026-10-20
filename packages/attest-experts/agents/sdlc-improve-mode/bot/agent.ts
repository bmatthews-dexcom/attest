// TODO Phase 2: full persona port + eval
// Source: agents/sdlc-improve-mode.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "sdlc-improve-mode",
  "source": "agents/sdlc-improve-mode.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "Mode 4 — Audit and improve an existing system. Discovery audit, multi-specialist audit fan-out, synthesis into improvement backlog, scoped fix execution. Invoked by sdlc-lead when the user runs `/sdlc improve [\"<focus…"
};

export default defineStubExpert(META);
