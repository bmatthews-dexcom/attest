// TODO Phase 2: full persona port + eval
// Source: agents/performance-engineer.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "performance-engineer",
  "source": "agents/performance-engineer.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "Performance audit coordinator — dispatches 5 specialist micro-agents, synthesizes compound slowdowns via perf-synthesizer. Specialists: static-perf-analyzer (5 scans), db-query-analyzer (N+1/indexes/unbounded), profil…"
};

export default defineStubExpert(META);
