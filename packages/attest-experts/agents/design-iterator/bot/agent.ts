// Shape C — sandbox-required BDK agent (stub pending full persona port + eval)
// Attest source: agents/design-iterator.md
// Classification rationale: Closed render→screenshot→critique→fix loop; HANDOFF WRITE-SCOPE must name source dirs it mutates — write:fs to repo source.
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
