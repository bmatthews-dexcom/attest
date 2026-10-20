// TODO Phase 2: full persona port + eval
// Source: agents/reliability-engineer.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "reliability-engineer",
  "source": "agents/reliability-engineer.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "Reliability engineer — load testing & resilience specialist: what breaks under stress and what happens then. Load-test strategy (k6/Locust/vegeta), chaos scenarios, circuit breakers, bulkheads, retries with backoff+ji…"
};

export default defineStubExpert(META);
