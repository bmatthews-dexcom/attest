import { defineEval } from "@cursor/bdk/evals";

/**
 * `/director sweep` runs the Phase-6 refinement pass. The agent must
 * call `director_sweep`; it must not interpret "sweep" as "create a
 * new expert" or as an approval resolution.
 */
export default defineEval({
  tags: ["slash", "unit", "director", "phase-6"],
  description:
    "/director sweep runs the Phase-6 refinement sweep; does not create or approve.",
  async test(t) {
    await t.send("/director sweep");

    t.succeeded();

    t.calledTool("director_sweep");

    t.notCalledTool("director_create_expert");
    t.notCalledTool("director_approve");
    t.notCalledTool("director_deny");

    t.maxToolCalls(3);
  },
});
