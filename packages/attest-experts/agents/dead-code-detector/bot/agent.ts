// TODO Phase 2: full persona port + eval
// Source: agents/code-review/dead-code-detector.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "dead-code-detector",
  "source": "agents/code-review/dead-code-detector.md",
  "cluster": "code-review",
  "status": "stub",
  "summary": "Dead and unutilized code specialist — unimplemented stubs, functions defined but never called, unused exports, orphan files, unreachable branches, disconnected pipelines (code wired to nothing). Tools: knip/ts-prune (…"
};

export default defineStubExpert(META);
