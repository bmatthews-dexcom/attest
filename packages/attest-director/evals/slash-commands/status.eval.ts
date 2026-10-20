import { defineEval } from "@cursor/bdk/evals";

/**
 * `/director status` without a target lists open briefs — must call
 * `director_status` (which fans out to MCP `director.list_briefs`),
 * never `director_create_expert`.
 */
export default defineEval({
  tags: ["slash", "unit", "director"],
  description:
    "/director status lists open briefs; does not create anything new.",
  async test(t) {
    await t.send("/director status");

    t.succeeded();

    t.calledTool("director_status");

    t.notCalledTool("director_create_expert");
    t.notCalledTool("director_approve");
    t.notCalledTool("director_deny");
    t.notCalledTool("director_sweep");

    t.maxToolCalls(3);
  },
});
