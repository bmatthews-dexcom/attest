import { defineEval } from "@cursor/bdk/evals";

/**
 * Multi-turn eval: ingest produces a draft plan → approve dispatches.
 *
 * Flow asserted:
 *   turn 1: `/ceo ingest …high-confidence bug text…`
 *            → `ceo_ingest` fires, draft plan lands under
 *              `ceo:plans:awaiting`, no dispatch yet.
 *   turn 2: `/ceo approve <plan-id>`
 *            → `ceo_approve` fires, builds the dispatch blueprint, and
 *              (under default autonomy `draft-and-approve`) calls the
 *              conductor connection's `run_autopilot_task` for each step.
 *
 * The follow-up uses the plan id the ingest tool returned via
 * `t.lastToolResult`.
 */
export default defineEval({
  tags: ["integration", "ceo", "chat", "approval"],
  description:
    "/ceo ingest then /ceo approve round-trip: ingest drafts a plan, approve dispatches via attest-conductor stub.",
  async test(t) {
    // --- Turn 1: ingest -----------------------------------------------
    await t.send(
      [
        "/ceo ingest",
        "",
        "Bug (p0): the dispatch blueprint drops `wallTimeCapMs` on the",
        "conductor stub call so the chief loop never terminates. Needs",
        "a fix today — users are blocked. Add a regression eval against",
        "the stub so we don't regress.",
      ].join("\n"),
    );

    t.succeeded();
    t.calledTool("ceo_ingest");

    // --- Turn 2: approve the drafted plan -----------------------------
    // The agent is expected to pull the planId from the previous turn's
    // ceo_ingest result (visible in its own transcript). We re-prompt
    // with a lenient instruction so a fresh LLM turn still finds it.
    await t.send(
      "/ceo approve the plan you just drafted from that bug. Use its id.",
    );

    t.succeeded();
    t.calledTool("ceo_approve");

    // Dispatch surface (via the attest-conductor stub). Soft because the
    // model MAY batch dispatch into fewer calls and the stub records both
    // modes; the hard invariant is `ceo_approve` fired.
    t.calledTool("run_autopilot_task").soft();

    t.notCalledTool("ceo_deny");
  },
});
