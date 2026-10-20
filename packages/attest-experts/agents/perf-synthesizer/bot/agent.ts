// TODO Phase 2: full persona port + eval
// Source: agents/performance/perf-synthesizer.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "perf-synthesizer",
  "source": "agents/performance/perf-synthesizer.md",
  "cluster": "performance",
  "status": "stub",
  "summary": "Performance master synthesizer — reads all specialist findings, identifies compounding slowdowns (slow query hitting in a hot O(n²) loop + no caching = multiplicative), produces final PERFORMANCE_REPORT with prioritiz…"
};

export default defineStubExpert(META);
