// TODO Phase 2: full persona port + eval
// Source: agents/gauntlet-lead.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "gauntlet-lead",
  "source": "agents/gauntlet-lead.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "Gauntlet-loop orchestrator — sets a real reference bar, splits the goal into independently gradeable units, dispatches builders (clean context) and blind fresh-per-round critics, loops failures until every unit beats…"
};

export default defineStubExpert(META);
