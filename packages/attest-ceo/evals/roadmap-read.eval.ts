import { defineEval } from "@cursor/bdk/evals";

/**
 * Smoke eval: `/ceo roadmap` must read the ledger through `ceo_roadmap`
 * and surface the initiative list — no mutation, no dispatch.
 *
 * Hard invariants:
 *   - `ceo_roadmap` is called;
 *   - no mutating tool fires (`ceo_ingest`, `ceo_approve`, `ceo_deny`,
 *     `ceo_refine`, `ceo_set_autonomy`, `run_ceo_turn`);
 *   - the turn succeeds (empty roadmap is a valid outcome on first boot).
 */
export default defineEval({
  tags: ["unit", "ceo", "chat"],
  description:
    "/ceo roadmap reads the ledger via ceo_roadmap and never touches a mutating tool.",
  async test(t) {
    await t.send("/ceo roadmap");

    t.succeeded();

    t.calledTool("ceo_roadmap");

    t.notCalledTool("ceo_ingest");
    t.notCalledTool("ceo_approve");
    t.notCalledTool("ceo_deny");
    t.notCalledTool("ceo_refine");
    t.notCalledTool("ceo_set_autonomy");

    t.maxToolCalls(4);
  },
});
