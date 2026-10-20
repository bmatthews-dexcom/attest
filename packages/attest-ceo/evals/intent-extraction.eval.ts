import { defineEval } from "@cursor/bdk/evals";

/**
 * Unit eval: `/ceo ingest …text…` must call `ceo_ingest`, which runs the
 * heuristic classifier (via the attest-ceo-mcp stub `extract_intent` /
 * `ingest_discussion` surface) and persists intents to the ledger.
 *
 * The pasted text is a mix of a bug report + a feature request + a
 * decision cue so the heuristic classifier has something to grip on.
 *
 * Hard invariants:
 *   - `ceo_ingest` is called;
 *   - no dispatch (`ceo_approve`, no `run_autopilot_task` on the chief
 *     connection — the Phase-1 flow stops at awaiting-approval).
 *
 * Soft: `extract_intent` MAY be called directly for a second-pass
 * refinement, but is not required (`ceo_ingest` already extracts).
 */
export default defineEval({
  tags: ["unit", "ceo", "chat", "ingest"],
  description:
    "/ceo ingest …text… routes to ceo_ingest, extracts intents, drafts an awaiting-approval plan, and does NOT dispatch.",
  async test(t) {
    await t.send(
      [
        "/ceo ingest",
        "",
        "From Slack #attest — pasted by Bradford:",
        "",
        "> We decided to add a dark mode toggle in the sidebar — same",
        "> keyboard shortcut as VS Code (cmd-shift-l). Users have asked",
        "> for this three times this quarter.",
        ">",
        "> Bug: the ledger write on refresh loses the autonomy mode when",
        "> the serve host restarts mid-turn. Need to repro and fix.",
      ].join("\n"),
    );

    t.succeeded();

    t.calledTool("ceo_ingest");

    t.notCalledTool("ceo_approve");
    t.notCalledTool("run_autopilot_task");

    t.maxToolCalls(5);

    t.calledTool("extract_intent").soft();
  },
});
