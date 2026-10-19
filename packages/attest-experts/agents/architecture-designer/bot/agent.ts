// TODO Phase 2: full persona port + eval
// Source: agents/architecture-designer.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "architecture-designer",
  "source": "agents/architecture-designer.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "Architecture designer — defines modular structure, public interfaces, plugin points, and infrastructure topology. Produces MODULE_DESIGN.md and INFRASTRUCTURE.md. Invoked by sdlc-lead during Phase 3."
};

export default defineStubExpert(META);
