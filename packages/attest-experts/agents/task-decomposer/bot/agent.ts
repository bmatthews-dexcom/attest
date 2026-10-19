// TODO Phase 2: full persona port + eval
// Source: agents/task-decomposer.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "task-decomposer",
  "source": "agents/task-decomposer.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "Task decomposition specialist — turns any request into a typed DAG of bounded leaf tasks (plan.json) sized for small-context models. Use before multi-step work, when a request spans 3+ files or 2+ specialists, or when…"
};

export default defineStubExpert(META);
