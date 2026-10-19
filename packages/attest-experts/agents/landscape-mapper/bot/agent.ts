import { defineExpert } from "../../../lib/expert-factory.js";
import { CONCRETE_EXPERTS } from "../../../lib/expert-registry.js";

const META = CONCRETE_EXPERTS.find((e) => e.id === "landscape-mapper")!;

export default defineExpert({
  meta: META,
  descriptionAddendum:
    "Reads README, package manifests, source tree, and git hotspots to produce LANDSCAPE.md orientation. Phase 0 onboarding — nothing else in the onboard pipeline runs until this ships.",
});
