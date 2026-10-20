import { defineExpert } from "../../../lib/expert-factory.js";
import { CONCRETE_EXPERTS } from "../../../lib/expert-registry.js";

const META = CONCRETE_EXPERTS.find((e) => e.id === "complexity-analyzer")!;

export default defineExpert({
  meta: META,
  descriptionAddendum:
    "Specialist dispatched by code-reviewer — reads one module / changeset and reports functions whose cyclomatic / cognitive complexity, length, or nesting makes them unsafe to change. Report-only.",
});
