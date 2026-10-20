// TODO Phase 2: full persona port + eval
// Source: agents/code-review/anti-slop-auditor.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "anti-slop-auditor",
  "source": "agents/code-review/anti-slop-auditor.md",
  "cluster": "code-review",
  "status": "stub",
  "summary": "AI slop detection specialist — checks all 31 ANTI_SLOP_RULES (R-01 to R-31) including 2025-2026 additions: slopsquatting (hallucinated packages), architectural privilege escalation (+322% in AI codebases), credential…"
};

export default defineStubExpert(META);
