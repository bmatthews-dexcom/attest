// TODO Phase 2: full persona port + eval
// Source: agents/code-review/pattern-consistency-checker.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "pattern-consistency-checker",
  "source": "agents/code-review/pattern-consistency-checker.md",
  "cluster": "code-review",
  "status": "stub",
  "summary": "Pattern and naming consistency specialist — cross-file pattern violations, naming conventions, comment accuracy (R-20, R-13, R-14). Detects AI-generated modules that use different patterns than surrounding codebase. E…"
};

export default defineStubExpert(META);
