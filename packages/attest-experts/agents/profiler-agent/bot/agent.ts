// TODO Phase 2: full persona port + eval
// Source: agents/performance/profiler-agent.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "profiler-agent",
  "source": "agents/performance/profiler-agent.md",
  "cluster": "performance",
  "status": "stub",
  "summary": "Runtime profiling specialist — identifies actual hotspots via profiler output, not guessing. Runs Node.js --prof, py-spy, perf, or reads existing profiler data. Only runs when a performance problem is confirmed or a b…"
};

export default defineStubExpert(META);
