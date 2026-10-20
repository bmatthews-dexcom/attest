import { defineExpert } from "../../../lib/expert-factory.js";
import { CONCRETE_EXPERTS } from "../../../lib/expert-registry.js";

const META = CONCRETE_EXPERTS.find((e) => e.id === "secrets-scanner")!;

export default defineExpert({
  meta: META,
  descriptionAddendum:
    "Credentials wave-1 specialist dispatched by security-auditor in parallel with semgrep-runner. Grounds on attest-mcp (`get_persona`), runs the `secrets-scan` validator over source + git history, escalates verified live credentials to CRITICAL, and reports structured findings via submit-report.",
});
