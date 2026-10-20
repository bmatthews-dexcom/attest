// TODO Phase 2: full persona port + eval
// Source: agents/code-review/duplication-detector.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "duplication-detector",
  "source": "agents/code-review/duplication-detector.md",
  "cluster": "code-review",
  "status": "stub",
  "summary": "Duplication and DRY specialist — copy-paste detection, near-duplicates, R-19 (repeated logic blocks). Uses jscpd/fdupes/PMD-CPD. Flags code that was duplicated rather than refactored — the #1 driver of AI-assisted tec…"
};

export default defineStubExpert(META);
