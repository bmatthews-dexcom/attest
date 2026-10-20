import { defineEval } from "@cursor/bdk/evals";

/**
 * Unit eval: the dispatch surface (`dispatch_plan` on attest-ceo-mcp) is
 * reachable from the agent and respects the autonomy gate.
 *
 * We send a direct `/ceo` request that walks the agent through the
 * dispatch primitive end-to-end against the mocked chief:
 *   1. flip autonomy to `auto-dispatch` so the gate is open;
 *   2. ingest a high-confidence feature request (drafts a plan);
 *   3. approve → the approve tool should bypass the awaiting-approval
 *      state and immediately dispatch via `run_autopilot_task` on the
 *      conductor stub.
 *
 * Hard invariants:
 *   - `ceo_set_autonomy` fires (we asked for it);
 *   - `ceo_ingest` fires;
 *   - `ceo_approve` fires and (soft) `run_autopilot_task` fires on the
 *     conductor connection.
 */
export default defineEval({
  tags: ["integration", "ceo", "dispatch"],
  description:
    "auto-dispatch autonomy + ingest + approve dispatches to the mocked chief via run_autopilot_task.",
  async test(t) {
    await t.send(
      [
        "Flip autonomy to auto-dispatch, then ingest the following",
        "feature request and dispatch the resulting plan without waiting",
        "for an interactive approval.",
        "",
        "/ceo set-autonomy auto-dispatch",
        "",
        "/ceo ingest",
        "",
        "Feature (p1): add a `/ceo digest` command that renders the",
        "last 24h of ingested discussions + any decisions logged. This",
        "is a clean add and does not touch dispatch.",
      ].join("\n"),
    );

    t.succeeded();

    t.calledTool("ceo_set_autonomy");
    t.calledTool("ceo_ingest");

    // Second-turn trigger: the agent may or may not approve on the same
    // turn depending on how it batches `/ceo` commands. We follow up with
    // an explicit approve so the dispatch surface is reliably exercised.
    await t.send("/ceo approve that plan — autonomy is auto-dispatch now.");

    t.succeeded();
    t.calledTool("ceo_approve");

    t.calledTool("run_autopilot_task").soft();
  },
});
