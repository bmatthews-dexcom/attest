// TODO Phase 2: full persona port + eval
// Source: agents/game/gameplay-engineer.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "gameplay-engineer",
  "source": "agents/game/gameplay-engineer.md",
  "cluster": "game",
  "status": "stub",
  "summary": "Gameplay engineering specialist — engine-specific implementation patterns (Godot, Unity, Phaser, Bevy, vanilla canvas): game loop vs frame budget, ECS vs inheritance, physics, input buffering, state machines, determin…"
};

export default defineStubExpert(META);
