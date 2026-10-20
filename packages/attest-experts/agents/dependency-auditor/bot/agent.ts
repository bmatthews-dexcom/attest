import { defineExpert } from "../../../lib/expert-factory.js";
import { CONCRETE_EXPERTS } from "../../../lib/expert-registry.js";

const META = CONCRETE_EXPERTS.find((e) => e.id === "dependency-auditor")!;

export default defineExpert({
  meta: META,
  descriptionAddendum:
    "Supply-chain wave-1 specialist dispatched by security-auditor in parallel with semgrep-runner. Grounds on attest-mcp (`get_persona`), runs the `dependency-audit` validator across npm/pip/cargo/go, triages CVEs with CISA KEV escalation, checks slopsquatting + dependency-confusion + install-time malice, and reports structured findings via submit-report.",
});
