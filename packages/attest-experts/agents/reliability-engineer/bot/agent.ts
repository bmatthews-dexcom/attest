// Shape C — sandbox-required BDK agent (stub pending full persona port + eval)
// Attest source: agents/reliability-engineer.md
// Classification rationale: `--loadtest` mode writes runnable scripts into tests/load/** — write:fs to repo source.
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
