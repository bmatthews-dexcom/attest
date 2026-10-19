// TODO Phase 2: full persona port + eval
// Source: agents/code-review/type-safety-checker.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "type-safety-checker",
  "source": "agents/code-review/type-safety-checker.md",
  "cluster": "code-review",
  "status": "stub",
  "summary": "Type safety and invariant specialist — any-escapes, null coercion, type assertions without guards, runtime type violations. Checks TypeScript strict mode compliance, Python type annotation consistency, and whether typ…"
};

export default defineStubExpert(META);
