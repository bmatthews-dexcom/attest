// TODO Phase 2: full persona port + eval
// Source: agents/end-user-simulator.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "end-user-simulator",
  "source": "agents/end-user-simulator.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "End-user simulation specialist — persona-driven true UAT. Walks the live app like a first-time human user with NO spec knowledge: only the persona, a goal, and what is on screen. Produces friction logs, first-run-expe…"
};

export default defineStubExpert(META);
