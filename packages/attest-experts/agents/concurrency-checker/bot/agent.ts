// TODO Phase 2: full persona port + eval
// Source: agents/performance/concurrency-checker.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "concurrency-checker",
  "source": "agents/performance/concurrency-checker.md",
  "cluster": "performance",
  "status": "stub",
  "summary": "Concurrency and async specialist — blocking operations in async paths, unguarded shared state, race conditions in concurrent handlers, missing mutex/lock patterns, unbounded Promise.all causing memory spikes. For Node…"
};

export default defineStubExpert(META);
