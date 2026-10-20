// TODO Phase 2: full persona port + eval
// Source: agents/ux-engineer.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "ux-engineer",
  "source": "agents/ux-engineer.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "Senior UX engineer — design direction, user workflows, component architecture, WCAG 2.2 accessibility, live-environment design review. Use when designing new interfaces (--design), reviewing PR UI changes (--review),…"
};

export default defineStubExpert(META);
