// TODO Phase 2: full persona port + eval
// Source: agents/db-architect.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "db-architect",
  "source": "agents/db-architect.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "Senior database architect — schema design, migrations, query optimization, indexing strategy, ORM models. Use when designing or modifying database schemas. Proactive: before adding tables or writing complex joins."
};

export default defineStubExpert(META);
