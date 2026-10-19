// TODO Phase 2: full persona port + eval
// Source: agents/design-iterator.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "design-iterator",
  "source": "agents/design-iterator.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "Visual design iteration specialist — the closed render→screenshot→critique→fix→re-verify loop that makes a running UI match its design system (Claude-Design-style: code and pixels in one feedback cycle). Grounds every…"
};

export default defineStubExpert(META);
