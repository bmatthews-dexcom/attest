import { defineExpert } from "../../../lib/expert-factory.js";
import { CONCRETE_EXPERTS } from "../../../lib/expert-registry.js";

const META = CONCRETE_EXPERTS.find((e) => e.id === "error-handling-auditor")!;

export default defineExpert({
  meta: META,
  descriptionAddendum:
    "Specialist dispatched by code-reviewer — hunts empty catch blocks, exception-driven control flow, swallowed errors, and serial awaits that should be Promise.all. Enforces R-01 through R-04. Report-only.",
});
