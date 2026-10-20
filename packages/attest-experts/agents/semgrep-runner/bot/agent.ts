import { defineExpert } from "../../../lib/expert-factory.js";
import { CONCRETE_EXPERTS } from "../../../lib/expert-registry.js";

const META = CONCRETE_EXPERTS.find((e) => e.id === "semgrep-runner")!;

export default defineExpert({
  meta: META,
  descriptionAddendum:
    "SAST wave-1 specialist dispatched by security-auditor. Grounds on attest-mcp (`get_persona`, `list_validators`), runs the `semgrep` validator over the task target, triages REAL/FP/UNVERIFIED, and reports structured findings via submit-report.",
});
