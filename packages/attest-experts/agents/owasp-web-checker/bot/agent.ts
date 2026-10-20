import { defineExpert } from "../../../lib/expert-factory.js";
import { CONCRETE_EXPERTS } from "../../../lib/expert-registry.js";

const META = CONCRETE_EXPERTS.find((e) => e.id === "owasp-web-checker")!;

export default defineExpert({
  meta: META,
  descriptionAddendum:
    "OWASP Top 10 wave-2 specialist dispatched by security-auditor. Reads prior semgrep-runner findings to avoid duplicates, grounds on attest-mcp (`get_persona`, `get_protocol`), runs the `owasp-web` validator per A01–A10 with a per-category confidence loop, and reports structured findings via submit-report.",
});
