// TODO Phase 2: full persona port + eval
// Source: agents/game/game-designer.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "game-designer",
  "source": "agents/game/game-designer.md",
  "cluster": "game",
  "status": "stub",
  "summary": "Game design specialist — core loop, mechanics, systems, and the Game Design Document (GDD, the game-project equivalent of the SRS). Use at the start of any game project or when a mechanic needs design. Owns WHAT the g…"
};

export default defineStubExpert(META);
