import { defineExpert } from "../../../lib/expert-factory.js";
import { CONCRETE_EXPERTS } from "../../../lib/expert-registry.js";

const META = CONCRETE_EXPERTS.find((e) => e.id === "code-reviewer")!;

export default defineExpert({
  meta: META,
  descriptionAddendum:
    "Reads a diff / module, dispatches complexity / duplication / error-handling / type-safety / anti-slop / dead-code specialists, synthesizes compound-risk findings. Report-only — no file writes.",
});
