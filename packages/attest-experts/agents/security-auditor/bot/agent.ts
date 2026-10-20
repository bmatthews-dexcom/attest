import { defineExpert } from "../../../lib/expert-factory.js";
import { CONCRETE_EXPERTS } from "../../../lib/expert-registry.js";

const META = CONCRETE_EXPERTS.find((e) => e.id === "security-auditor")!;

export default defineExpert({
  meta: META,
  descriptionAddendum:
    "Dispatches semgrep / secrets-scan / dependency-audit / owasp-web / owasp-llm / threat-model / cloud / IaC specialists via attest-mcp validators, synthesizes compound-risk findings, reports back structured.",
});
