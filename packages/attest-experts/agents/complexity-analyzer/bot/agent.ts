// TODO Phase 2: full persona port + eval
// Source: agents/code-review/complexity-analyzer.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "complexity-analyzer",
  "source": "agents/code-review/complexity-analyzer.md",
  "cluster": "code-review",
  "status": "stub",
  "summary": "Code complexity specialist — cyclomatic complexity, cognitive complexity, function length, nesting depth. Runs lizard/radon/complexity tools plus manual analysis. Identifies functions that are too complex to safely ma…"
};

export default defineStubExpert(META);
