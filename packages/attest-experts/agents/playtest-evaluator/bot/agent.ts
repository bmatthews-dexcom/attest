// TODO Phase 2: full persona port + eval
// Source: agents/game/playtest-evaluator.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "playtest-evaluator",
  "source": "agents/game/playtest-evaluator.md",
  "cluster": "game",
  "status": "stub",
  "summary": "Playtest specialist — plays the vertical slice via browser/input automation and evaluates against fun heuristics: clarity of goal, feedback juice, difficulty ramp, time-to-first-success. The game equivalent of end-use…"
};

export default defineStubExpert(META);
