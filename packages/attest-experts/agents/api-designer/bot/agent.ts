// TODO Phase 2: full persona port + eval
// Source: agents/api-designer.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "api-designer",
  "source": "agents/api-designer.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "API design expert — REST/GraphQL, contracts, versioning, documentation. Use when designing new endpoints, reviewing API consistency, or planning API versioning strategy. NOT for implementation."
};

export default defineStubExpert(META);
