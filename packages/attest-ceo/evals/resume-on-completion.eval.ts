import { defineEval } from "@cursor/bdk/evals";

/**
 * Unit eval: `run_ceo_turn` with `trigger: "chief-completion"` reconciles
 * closed chief tasks against the ledger.
 *
 * Phase-1 scope: the attest-mcp stub returns `{ present: false }` for
 * all taskIds (Shape C of attest-mcp has not landed), so reconciliation
 * is a no-op — but the call surface itself is what we assert on. When
 * Shape C ships the real `attest://tasks/<id>/completion.json` resource,
 * this eval starts proving that the CEO advances plan steps + marks
 * plans complete; today it just proves the plumbing is wired.
 *
 * Hard invariants:
 *   - `run_ceo_turn` is called;
 *   - the attest-mcp stub `read_task_completion` is called (soft — the
 *     agent will only call it if there is an in-flight TaskRef to
 *     reconcile; on a fresh ledger there is none).
 */
export default defineEval({
  tags: ["unit", "ceo", "resume"],
  description:
    "run_ceo_turn with chief-completion trigger reconciles via attest-mcp stub; stays safe on a fresh ledger.",
  async test(t) {
    await t.send(
      [
        "Internal: a chief task just completed. Run one CEO turn to",
        "reconcile and surface the state.",
        "",
        "Call run_ceo_turn with trigger=chief-completion, chiefTaskId=task_stub_1.",
      ].join("\n"),
    );

    t.succeeded();

    t.calledTool("run_ceo_turn");

    // Soft: `read_task_completion` only fires if there is at least one
    // in-flight TaskRef in the ledger. On a fresh ledger there is none,
    // so this is an aspirational check for Shape C + a loaded fixture.
    t.calledTool("read_task_completion").soft();

    // The CEO must not dispatch new work on a reconciliation trigger.
    t.notCalledTool("run_autopilot_task");
    t.notCalledTool("ceo_approve");
    t.notCalledTool("ceo_ingest");
  },
});
