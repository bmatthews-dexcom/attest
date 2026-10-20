import { defineEval } from "@cursor/bdk/evals";

/**
 * `/director set-autonomy draft-and-approve auto-for-repeat-role=true`
 * is the ONE autonomy flip we allow in Phase 1 and it must go through
 * `director_set_autonomy` — which internally calls the MCP's
 * `director.autonomy-set` with the auto-for-repeat-role hook.
 *
 * The flip is destructive-ish (changes future approval behaviour), so
 * the agent must NOT silently create an expert in the same turn.
 */
export default defineEval({
  tags: ["slash", "unit", "director"],
  description:
    "/director set-autonomy auto-for-repeat-role=true routes through director_set_autonomy; does not kick off a new brief.",
  async test(t) {
    await t.send(
      "/director set-autonomy draft-and-approve auto-for-repeat-role=true",
    );

    t.succeeded();

    t.calledTool("director_set_autonomy");

    t.notCalledTool("director_create_expert");
    t.notCalledTool("director_approve");
    t.notCalledTool("director_sweep");

    t.maxToolCalls(3);
  },
});
