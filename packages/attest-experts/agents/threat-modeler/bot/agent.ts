import { defineExpert } from "../../../lib/expert-factory.js";
import { CONCRETE_EXPERTS } from "../../../lib/expert-registry.js";

const META = CONCRETE_EXPERTS.find((e) => e.id === "threat-modeler")!;

export default defineExpert({
  meta: META,
  descriptionAddendum:
    "STRIDE wave-3 specialist dispatched by security-auditor after semgrep-runner. Grounds on attest-mcp (`get_persona`, `get_protocol`), reads architecture docs + confirmed findings, builds a DFD + per-component STRIDE table + Standing Threat Archetype assessment, and reports structured findings via submit-report.",
});
