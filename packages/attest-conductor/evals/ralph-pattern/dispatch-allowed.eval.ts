import { defineEval } from "@cursor/bdk/evals";

/**
 * Ralph-pattern verification: **Shape C — dispatch allowed**.
 *
 * The task is at `phase=intake` with autonomy `auto`. `pre_dispatch_check`
 * (if the agent calls it first) will come back `allow` under the stub —
 * so the agent should go straight to `invoke_expert`.
 *
 * Correct moves (soft gates):
 *   - `pre_dispatch_check` (preferred preview on the first move),
 *   - `invoke_expert` with the routed expert id,
 *   - `route_goal` to pick the expert first (also allowed).
 *
 * Wrong moves (hard gates):
 *   - `mark_done` / `escalate` / `advance_phase` — nothing to end on yet.
 *   - `dispatch_expert` — Shape-A tool name; must not reappear.
 */
export default defineEval({
  tags: ["ralph", "unit", "conductor", "shape-c"],
  description:
    "Shape C fresh task: pick a Shape-C-palette action (pre_dispatch_check or invoke_expert), never the Shape-A dispatch_expert tool.",
  async test(t) {
    await t.send(
      [
        "You are the attest autopilot conductor for task task_demo_allowed.",
        "Goal: review this trivial repo for security issues",
        "Autonomy mode: auto — auto-approve non-destructive; HITL for destructive; fail-closed when no transport.",
        "",
        "Current state (compact JSON — the only thing that changes between iterations):",
        "```json",
        JSON.stringify(
          {
            taskId: "task_demo_allowed",
            status: "running",
            currentPhase: "intake",
            iteration: 0,
            iterationCap: 6,
            consecutiveNoProgress: 0,
            consecutiveNoProgressCap: 3,
            autonomyMode: "auto",
            pendingApprovalIds: [],
            githubContext: null,
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
        "- security-reviewer — audits for CVEs, auth gaps, dependency risk",
        "- code-reviewer — reads for dead code, duplication, API drift",
        "",
        "## Decide and perform the single next step toward the goal",
        "",
        "Pick exactly one of: pre_dispatch_check, invoke_expert, phase_gate_check,",
        "validate_<name>, advance_phase, record_finding, update_scratchpad,",
        "compact_state, mark_done, escalate, request_approval, set_autonomy_mode.",
        "Use actionId: \"allowed-0\". Then end the turn.",
      ].join("\n"),
    );

    t.succeeded();

    t.notCalledTool("mark_done");
    t.notCalledTool("escalate");
    t.notCalledTool("advance_phase");
    // Hard: Shape-A `dispatch_expert` must not reappear anywhere.
    t.notCalledTool("dispatch_expert");

    t.maxToolCalls(5);

    t.calledTool("pre_dispatch_check").soft();
    t.calledTool("invoke_expert").soft();
    t.calledTool("route_goal").soft();
  },
});
