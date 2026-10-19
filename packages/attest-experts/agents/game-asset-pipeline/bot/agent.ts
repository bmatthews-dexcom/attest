// TODO Phase 2: full persona port + eval
// Source: agents/game/game-asset-pipeline.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "game-asset-pipeline",
  "source": "agents/game/game-asset-pipeline.md",
  "cluster": "game",
  "status": "stub",
  "summary": "Game asset pipeline specialist — runs one batch of sprite assets through gen (model call) → post-process (lattice/pixel-snapper cleanup, transparency de-fringing) → sprite-sheet packing → portable engine-import manife…"
};

export default defineStubExpert(META);
