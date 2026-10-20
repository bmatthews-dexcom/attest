// TODO Phase 2: full persona port + eval
// Source: agents/game/narrative-designer.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "narrative-designer",
  "source": "agents/game/narrative-designer.md",
  "cluster": "game",
  "status": "stub",
  "summary": "Narrative design specialist — integrates story into SYSTEMS: branching structure, quest/mission logic, barks, environmental storytelling, dialogue data formats. Narrative designer ≠ writer: this agent designs how stor…"
};

export default defineStubExpert(META);
