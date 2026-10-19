// TODO Phase 2: full persona port + eval
// Source: agents/security/semgrep-runner.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "semgrep-runner",
  "source": "agents/security/semgrep-runner.md",
  "cluster": "security",
  "status": "stub",
  "summary": "SAST specialist — runs semgrep with all registered rule packs (community + custom), triages findings REAL/FP/UNVERIFIED, writes structured finding output. Phase 1 of any security scan. Always runs; other specialists b…"
};

export default defineStubExpert(META);
