// TODO Phase 2: full persona port + eval
// Source: agents/game/game-balance-designer.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "game-balance-designer",
  "source": "agents/game/game-balance-designer.md",
  "cluster": "game",
  "status": "stub",
  "summary": "Game balance and economy specialist — progression curves, economy sinks/sources, difficulty tuning, drop tables. Outputs spreadsheet-style models with formulas and SIMULATES them (1000 player-sessions as a script) bef…"
};

export default defineStubExpert(META);
