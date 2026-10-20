import { defineExpert } from "../../../lib/expert-factory.js";
import { CONCRETE_EXPERTS } from "../../../lib/expert-registry.js";

const META = CONCRETE_EXPERTS.find((e) => e.id === "dead-code-detector")!;

export default defineExpert({
  meta: META,
  descriptionAddendum:
    "Specialist dispatched by code-reviewer — runs five scans (unimplemented stubs, defined-but-never-called, orphan files, disconnected pipelines, unreachable branches) via knip / ts-prune / vulture / staticcheck plus reference-count grep. Report-only.",
});
