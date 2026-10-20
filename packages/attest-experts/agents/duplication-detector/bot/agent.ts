import { defineExpert } from "../../../lib/expert-factory.js";
import { CONCRETE_EXPERTS } from "../../../lib/expert-registry.js";

const META = CONCRETE_EXPERTS.find((e) => e.id === "duplication-detector")!;

export default defineExpert({
  meta: META,
  descriptionAddendum:
    "Specialist dispatched by code-reviewer — runs jscpd / fdupes / PMD-CPD and manual near-duplicate scanning, flags repeated logic blocks (R-19) and copy-paste that should have been a shared abstraction. Report-only.",
});
