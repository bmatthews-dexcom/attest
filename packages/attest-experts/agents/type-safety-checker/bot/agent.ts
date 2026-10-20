import { defineExpert } from "../../../lib/expert-factory.js";
import { CONCRETE_EXPERTS } from "../../../lib/expert-registry.js";

const META = CONCRETE_EXPERTS.find((e) => e.id === "type-safety-checker")!;

export default defineExpert({
  meta: META,
  descriptionAddendum:
    "Specialist dispatched by code-reviewer — hunts any-escapes, non-null assertions without guards, unsafe type assertions, and strict-mode gaps across TS / Python / Rust / Go. Runs tsc / mypy / grep tripwires. Report-only.",
});
