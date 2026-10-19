import { defineEval } from "@cursor/bdk/evals";

/**
 * Ralph-pattern verification: **mid phase, gate holding on repeat gaps**.
 *
 * Given a Ralph prompt whose state shows the agent has already dispatched
 * `security-reviewer` twice at `phase=verify`, the last gate held with
 * the same gap, and `consecutiveNoProgress=2` (one away from the cap),
 * the agent must either:
 *
 * - escalate (we're at the ladder's end), or
 * - record a finding + try a different expert / validator, or
 * - compact state and update scratchpad to think clearly.
 *
 * `mark_done` is explicitly wrong — the goal is not met.
 */
export default defineEval({
  tags: ["ralph", "unit", "conductor"],
  description:
    "Ralph prompt with heal-ladder exhausted picks escalate or re-plan, never mark_done.",
  async test(t) {
    const taskId = "task_demo_mid";
    await t.send(
      [
        `You are the attest autopilot conductor for task ${taskId}.`,
        "Goal: patch CVE-2026-1337 in the auth middleware",
        "",
        "Current state (compact JSON — the only thing that changes between iterations):",
        "```json",
        JSON.stringify(
          {
            taskId,
            status: "running",
            currentPhase: "verify",
            iteration: 4,
            iterationCap: 6,
            consecutiveNoProgress: 2,
            consecutiveNoProgressCap: 3,
            recentPhaseHistory: [
              { phase: "intake", enteredAtMs: 0, reason: "conductor_begin" },
              { phase: "build", enteredAtMs: 1_000, reason: "intake gate green" },
              { phase: "verify", enteredAtMs: 2_000, reason: "build gate green" },
            ],
            lastExpert: {
              iteration: 4,
              expertId: "security-reviewer",
              summary:
                "found 1 gap: middleware still accepts unsigned JWTs on refresh path",
              status: "ok",
            },
            openFindings: [
              {
                source: "validate-auth",
                severity: "gate",
                message: "unsigned JWTs accepted on refresh (same gap, 2nd pass)",
                iteration: 4,
              },
              {
                source: "validate-auth",
                severity: "gate",
                message: "unsigned JWTs accepted on refresh (same gap, 1st pass)",
                iteration: 3,
              },
            ],
            softFindingCount: 0,
            scratchpad:
              "tried security-reviewer twice at verify; same validate-auth gap each time; the heal ladder says: escalate on the 3rd consecutive no-progress.",
            lastSummary:
              "security-reviewer round 2 ran; gap unchanged; consecutiveNoProgress now 2.",
            escalated: false,
          },
          null,
          2,
        ),
        "```",
        "",
        "SDLC rules for this iteration (from attest-mcp):",
        "FIX_VERIFY_LOOP: STALLED after 2 same-tier attempts → escalate; byte-identical gap across two consecutive passes → HALT immediately (RALPH_WIGGUM_LOOP /goal rule).",
        "",
        "Validators relevant to the current phase:",
        "- validate-auth",
        "- validate-architecture",
        "",
        "Experts available to dispatch:",
        "- security-reviewer — tried twice, same gap",
        "- code-reviewer — would read for dead code, could catch the refresh branch",
        "",
        "## Decide and perform the single next step toward the goal",
        "",
        "Pick exactly one of: dispatch_expert, validate, phase_gate_check,",
        "advance_phase, record_finding, update_scratchpad, compact_state,",
        "mark_done, escalate. Use actionId: \"mid-4\". Then end the turn.",
      ].join("\n"),
    );

    t.succeeded();

    t.notCalledTool("mark_done");
    t.notCalledTool("advance_phase");

    t.maxToolCalls(5);

    t.calledTool("escalate").soft();
    t.calledTool("dispatch_expert").soft();
    t.calledTool("conductor_record_finding").soft();
    t.calledTool("update_scratchpad").soft();
  },
});
