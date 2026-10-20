// Shape C — sandbox-required BDK agent (stub pending full persona port + eval)
// Attest source: agents/game/gameplay-engineer.md
// Classification rationale: WRITE-SCOPE = 'the source dirs named in the HANDOFF + docs/design/game/TECH_NOTES.md' — write:fs to repo source.
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
