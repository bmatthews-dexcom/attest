import { defineEval } from "@cursor/bdk/evals";

/**
 * Bare `/director` must call `director.show_help` — never silently
 * no-op, never jump straight to `director.create_expert` without a
 * brief.
 */
export default defineEval({
  tags: ["slash", "unit", "director"],
  description:
    "/director with no verb prints the help card and does not kick off any phase.",
  async test(t) {
    await t.send("/director");

    t.succeeded();

    t.calledTool("director_show_help");

    t.notCalledTool("director_create_expert");
    t.notCalledTool("director_approve");
    t.notCalledTool("director_deny");
    t.notCalledTool("director_sweep");
    t.notCalledTool("director_refine_request");
    t.notCalledTool("director_set_autonomy");

    t.maxToolCalls(2);
  },
});
