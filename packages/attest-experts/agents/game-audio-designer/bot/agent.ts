// Shape C — sandbox-required BDK agent (stub pending full persona port + eval)
// Attest source: agents/game/game-audio-designer.md
// Classification rationale: WRITE-SCOPE extends into HANDOFF-named audio asset/event dirs (engine source) — write:fs to repo source.
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
