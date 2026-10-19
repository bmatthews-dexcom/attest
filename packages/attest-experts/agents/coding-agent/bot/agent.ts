// TODO Phase 2: full persona port + eval
// Source: agents/coding-agent.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "coding-agent",
  "source": "agents/coding-agent.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "Senior implementation engineer — doc-driven coding from SDLC specs. Verifies all library APIs via Context7 before writing code. Enforces anti-slop rules: no over-engineering, no defensive bloat, no hallucinated APIs,…"
};

export default defineStubExpert(META);
