// TODO Phase 2: full persona port + eval
// Source: agents/security/cloud-security-checker.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "cloud-security-checker",
  "source": "agents/security/cloud-security-checker.md",
  "cluster": "security",
  "status": "stub",
  "summary": "Cloud security specialist — AWS and GCP security anti-patterns in source code and SDK usage. Checks hardcoded keys, overly permissive IAM, open security groups, missing audit logs, public storage, and GCP-specific pat…"
};

export default defineStubExpert(META);
