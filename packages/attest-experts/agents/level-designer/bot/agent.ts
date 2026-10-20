// Shape C — sandbox-required BDK agent (stub pending full persona port + eval)
// Attest source: agents/game/level-designer.md
// Classification rationale: WRITE-SCOPE extends into HANDOFF-named level/map data dirs (engine source) — write:fs to repo source.
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "level-designer",
  "source": "agents/game/level-designer.md",
  "cluster": "game",
  "status": "stub",
  "summary": "Level design specialist — player flow, encounter design, blockout/greybox discipline, pacing beat charts, teaching-through-space. Owns the physical/spatial experience of a level from blockout to content lock; works in…"
};

export default defineStubExpert(META);
