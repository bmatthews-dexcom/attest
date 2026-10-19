// TODO Phase 2: full persona port + eval
// Source: agents/design-system-lead.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "design-system-lead",
  "source": "agents/design-system-lead.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "Design system specialist — produces the pre-code token spec (docs/design/tokens.json) and component inventory (docs/design/components.md) that high-fi mockups and implementation both build from. Runs at SDLC Phase 3.5…"
};

export default defineStubExpert(META);
