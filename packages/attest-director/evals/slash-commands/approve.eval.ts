import { defineEval } from "@cursor/bdk/evals";

/**
 * `/director approve <id>` resolves the Phase-5 approval card for a
 * named brief / expert. Must call `director_approve` with the id and
 * NEVER call `director_create_expert` (approval resolves an existing
 * ask, it does not spin up new work).
 */
export default defineEval({
  tags: ["slash", "unit", "director"],
  description:
    "/director approve <id> resolves an open approval; does not open a new phase.",
  async test(t) {
    await t.send("/director approve rb-20261020-abcd");

    t.succeeded();

    t.calledTool("director_approve");

    t.notCalledTool("director_create_expert");
    t.notCalledTool("director_deny");
    t.notCalledTool("director_sweep");
    t.notCalledTool("director_refine_request");

    t.maxToolCalls(3);
  },
});
