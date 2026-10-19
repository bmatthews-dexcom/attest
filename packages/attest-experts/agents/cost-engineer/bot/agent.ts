// TODO Phase 2: full persona port + eval
// Source: agents/cost-engineer.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "cost-engineer",
  "source": "agents/cost-engineer.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "Cost engineer — cloud + LLM spend analysis, right-sizing, reserved capacity/commitments, cost observability. Use before scaling decisions, after first cloud bill shock, or when unit economics are unknown. NOT for perf…"
};

export default defineStubExpert(META);
