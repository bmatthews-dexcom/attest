import { defineEval } from "@cursor/bdk/evals";

/**
 * Ralph-pattern verification: **early phase, nothing has run yet**.
 *
 * Given a Ralph prompt whose state shows `phase=intake, iteration=0,
 * visitedExperts=[], findings=[]`, the agent must:
 *
 * - produce **one** meaningful tool action (hard gate on `maxToolCalls`);
 * - NOT jump to a terminal action — `mark_done`, `escalate`, or
 *   `advance_phase` are all wrong this early (hard `notCalledTool` gates);
 * - call something productive — `route_goal`, `dispatch_expert`,
 *   `update_scratchpad`, or `conductor_get_state` are all fine
 *   (soft `calledTool` gates — the exact first move is model's call).
 */
export default defineEval({
  tags: ["ralph", "unit", "conductor"],
  description:
    "Ralph prompt at phase=intake with empty history must pick a routing/dispatch/plan action, never a terminal one.",
  async test(t) {
    await t.send(
      [
        "You are the attest autopilot conductor for task task_demo_early.",
        "Goal: harden the login flow",
        "",
        "Current state (compact JSON — the only thing that changes between iterations):",
        "```json",
        JSON.stringify(
          {
            taskId: "task_demo_early",
            status: "running",
            currentPhase: "intake",
            iteration: 0,
            iterationCap: 6,
            consecutiveNoProgress: 0,
            consecutiveNoProgressCap: 3,
            recentPhaseHistory: [
              { phase: "intake", enteredAtMs: 0, reason: "conductor_begin" },
            ],
            lastExpert: null,
            openFindings: [],
            softFindingCount: 0,
            scratchpad: "",
            lastSummary: "",
            escalated: false,
          },
          null,
          2,
        ),
        "```",
        "",
        "SDLC rules for this iteration (from attest-mcp):",
        "(call attest-mcp phase_gate_check or route_goal yourself)",
        "",
        "Validators relevant to the current phase: (none pre-fetched)",
        "",
        "Experts available to dispatch:",
        "- guide — concierge router",
        "- security-reviewer — audits for CVEs, auth gaps, dependency risk",
        "",
        "## Decide and perform the single next step toward the goal",
        "",
        "Pick exactly one of: dispatch_expert, phase_gate_check (then",
        "validate_<name>), advance_phase, record_finding, update_scratchpad,",
        "compact_state, mark_done, escalate. Use actionId: \"early-0\". Then",
        "end the turn.",
      ].join("\n"),
    );

    t.succeeded();

    t.notCalledTool("mark_done");
    t.notCalledTool("escalate");
    t.notCalledTool("advance_phase");

    t.maxToolCalls(5);

    t.calledTool("route_goal").soft();
    t.calledTool("dispatch_expert").soft();
    t.calledTool("update_scratchpad").soft();
  },
});
