// TODO Phase 2: full persona port + eval
// Source: agents/game/game-audio-designer.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "game-audio-designer",
  "source": "agents/game/game-audio-designer.md",
  "cluster": "game",
  "status": "stub",
  "summary": "Game audio specialist — sonic direction, SFX/music/VO planning, middleware architecture (FMOD/Wwise vs engine-native), event naming, mix rules, memory/voice budgets, and agent-generated placeholder audio (ElevenLabs M…"
};

export default defineStubExpert(META);
