import { defineEval } from "@cursor/bdk/evals";

/**
 * Ralph-pattern verification: **final phase, every gate is green**.
 *
 * The state carries `phase=done`, every validator ok, zero open findings,
 * the last gate check returned `status: "done"`. The agent must call
 * `mark_done` and nothing else. Dispatching another expert, running
 * another validator, or escalating here are all wrong.
 */
export default defineEval({
  tags: ["ralph", "unit", "conductor"],
  description:
    "Ralph prompt at phase=done with zero open findings produces exactly a mark_done tool call.",
  async test(t) {
    const taskId = "task_demo_final";
    await t.send(
      [
        `You are the attest autopilot conductor for task ${taskId}.`,
        "Goal: ship CVE-2026-1337 patch",
        "",
        "Current state (compact JSON — the only thing that changes between iterations):",
        "```json",
        JSON.stringify(
          {
            taskId,
            status: "running",
            currentPhase: "done",
            iteration: 5,
            iterationCap: 6,
            consecutiveNoProgress: 0,
            consecutiveNoProgressCap: 3,
            recentPhaseHistory: [
              { phase: "build", enteredAtMs: 1_000, reason: "intake gate green" },
              { phase: "verify", enteredAtMs: 2_000, reason: "build gate green" },
              { phase: "done", enteredAtMs: 3_000, reason: "verify gate green" },
            ],
            lastExpert: {
              iteration: 5,
              expertId: "test-author",
              summary: "regression test covers refresh path; verify gate now green.",
              status: "ok",
            },
            openFindings: [],
            softFindingCount: 2,
            scratchpad:
              "every validator in verify went green on this iteration; phase_gate_check returned status=done; nothing left pending.",
            lastSummary:
              "verify gate: status=done, 0 gaps, receipt docs/work/gates/verify.json. Goal complete.",
            escalated: false,
          },
          null,
          2,
        ),
        "```",
        "",
        "SDLC rules for this iteration (from attest-mcp):",
        "ASSEMBLY_GATE_PREDICATE: requirement closure clean; every seam done; phase gates green with receipts; verify green on main; no unmerged branches unaccounted for. Status 'done' from phase_gate_check satisfies the predicate for a single-slice task.",
        "",
        "Validators relevant to the current phase: (none — gate is already done)",
        "",
        "Experts available to dispatch: (none needed — gate is done)",
        "",
        "## Decide and perform the single next step toward the goal",
        "",
        "Pick exactly one of: dispatch_expert, phase_gate_check (then",
        "validate_<name>), advance_phase, record_finding, update_scratchpad,",
        "compact_state, mark_done, escalate. Use actionId: \"final-5\". Then",
        "end the turn.",
      ].join("\n"),
    );

    t.succeeded();

    t.calledTool("mark_done");
    t.notCalledTool("escalate");
    t.notCalledTool("dispatch_expert");
    t.notCalledTool("advance_phase");

    t.maxToolCalls(3);
  },
});
