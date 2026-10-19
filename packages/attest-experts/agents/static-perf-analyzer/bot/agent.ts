// TODO Phase 2: full persona port + eval
// Source: agents/performance/static-perf-analyzer.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "static-perf-analyzer",
  "source": "agents/performance/static-perf-analyzer.md",
  "cluster": "performance",
  "status": "stub",
  "summary": "Static performance analysis specialist — O(n²) nested loops, N+1 query patterns, blocking I/O in async paths, try/catch in hot loops (5-20x slowdown), unnecessary allocations. No profiler needed — finds structural per…"
};

export default defineStubExpert(META);
