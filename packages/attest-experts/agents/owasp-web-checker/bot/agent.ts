// TODO Phase 2: full persona port + eval
// Source: agents/security/owasp-web-checker.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "owasp-web-checker",
  "source": "agents/security/owasp-web-checker.md",
  "cluster": "security",
  "status": "stub",
  "summary": "OWASP Web Top 10 specialist (2021) — manual A01–A10 checks per category with confidence loop. One context window per category. Reads semgrep-runner output to avoid duplicate findings. Writes per-category OWASP_TRACKER…"
};

export default defineStubExpert(META);
