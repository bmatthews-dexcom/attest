// TODO Phase 2: full persona port + eval
// Source: agents/performance/db-query-analyzer.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "db-query-analyzer",
  "source": "agents/performance/db-query-analyzer.md",
  "cluster": "performance",
  "status": "stub",
  "summary": "Database query performance specialist — missing indexes, slow query patterns, N+1 at the DB layer, unparameterized queries, missing pagination, unbounded queries on large tables. Checks query shapes in ORM calls and r…"
};

export default defineStubExpert(META);
