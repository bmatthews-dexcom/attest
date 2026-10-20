// TODO Phase 2: full persona port + eval
// Source: agents/code-review/error-handling-auditor.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "error-handling-auditor",
  "source": "agents/code-review/error-handling-auditor.md",
  "cluster": "code-review",
  "status": "stub",
  "summary": "Error handling and silent failure specialist — empty catch blocks, exception-driven control flow, swallowed errors, missing error boundaries, serial awaits vs Promise.all. Enforces R-01 through R-04. Veracode 2025: er…"
};

export default defineStubExpert(META);
