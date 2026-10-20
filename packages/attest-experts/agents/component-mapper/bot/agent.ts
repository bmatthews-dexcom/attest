// TODO Phase 2: full persona port + eval
// Source: agents/sdlc/onboard/component-mapper.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "component-mapper",
  "source": "agents/sdlc/onboard/component-mapper.md",
  "cluster": "onboarding",
  "status": "stub",
  "summary": "Onboard specialist — Step 4. Maps internal modules and deployment topology. Produces c2-containers.md (C2 Container: all services + external systems) and c3-components.md (C3 Component: internal module dependencies).…"
};

export default defineStubExpert(META);
