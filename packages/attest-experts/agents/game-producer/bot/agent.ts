// TODO Phase 2: full persona port + eval
// Source: agents/game/game-producer.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "game-producer",
  "source": "agents/game/game-producer.md",
  "cluster": "game",
  "status": "stub",
  "summary": "Game production specialist — lifecycle gates on builds (prototype kill-criteria → vertical slice → alpha feature-lock → beta content-lock → cert → gold), milestone schedules, scope control, indie vs AAA mode, and indi…"
};

export default defineStubExpert(META);
