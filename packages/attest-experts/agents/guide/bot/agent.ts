// TODO Phase 2: full persona port + eval
// Source: agents/guide.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "guide",
  "source": "agents/guide.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "Expert-system concierge — the front door. Given a plain-English goal, figures out which expert(s) and workflow you need, explains the route, and drives it end to end. Use when you are not sure which command to run, or…"
};

export default defineStubExpert(META);
