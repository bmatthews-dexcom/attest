// TODO Phase 2: full persona port + eval
// Source: agents/security/iac-security-checker.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "iac-security-checker",
  "source": "agents/security/iac-security-checker.md",
  "cluster": "security",
  "status": "stub",
  "summary": "Infrastructure-as-Code security specialist — Terraform, CDK, Pulumi, CloudFormation. Runs Checkov (primary), KICS (breadth), Trivy config scan (replaces deprecated tfsec). Checks exposed credentials, open IAM, unencry…"
};

export default defineStubExpert(META);
