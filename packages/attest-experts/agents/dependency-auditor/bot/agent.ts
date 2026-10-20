// TODO Phase 2: full persona port + eval
// Source: agents/security/dependency-auditor.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "dependency-auditor",
  "source": "agents/security/dependency-auditor.md",
  "cluster": "security",
  "status": "stub",
  "summary": "Dependency and supply chain security specialist — CVE scans, SBOM/SCA correlation (syft + grype, CISA KEV), outdated packages, license risk, and slopsquatting detection (AI-hallucinated package names registered by att…"
};

export default defineStubExpert(META);
