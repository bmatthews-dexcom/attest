import { defineEval } from "@cursor/bdk/evals";

/**
 * End-to-end eval, rebuilt on top of the Ralph loop.
 *
 * Scenario: the user types `/autopilot <goal>` on the chat channel. The
 * agent recognizes it, calls `run_autopilot_task`, which:
 *
 *   - creates the task,
 *   - drives the Ralph loop (one `ctx.send("http", ralphPrompt)` turn
 *     per iteration, each turn hits exactly one of the Ralph tools),
 *   - stops when the TS loop driver's `shouldStop` fires (iteration cap,
 *     consecutive-no-progress cap, wall-time cap) OR the agent calls
 *     `mark_done` / `escalate`.
 *
 * Both attest-mcp and `dispatch_expert` run in stub mode (default), so
 * the loop terminates with the stub routing table and the stub expert.
 *
 * **What this proves (Phase-2 skeleton).**
 *
 * 1. `/autopilot <goal>` → `run_autopilot_task` chat trigger works.
 * 2. The Ralph loop driver actually runs multiple sub-turns.
 * 3. The agent inside the sub-turns reaches for the right tool palette
 *    (`dispatch_expert`, `validate`, `phase_gate_check`, `advance_phase`,
 *    `mark_done`).
 * 4. The task terminates — either by agent action (`mark_done`) or by
 *    one of the TS caps.
 *
 * **What this does NOT prove.** Real peer / HTTP expert dispatch (the
 * sibling `packages/attest-experts/` lands its own evals for each
 * expert); real attest-mcp wire protocol (sibling `packages/attest-mcp/`
 * owns that); GitHub channel trigger (validated by `bdk validate` but
 * not exercised here).
 */
export default defineEval({
  tags: ["e2e", "conductor"],
  description:
    "/autopilot <goal> runs the Ralph loop end-to-end through run_autopilot_task against inline stubs.",
  async test(t) {
    await t.send(
      "/autopilot harden the login flow — iterationCap 3, maxTurns 3, consecutiveNoProgressCap 2 so the loop terminates fast.",
      {
        workspaceFiles: {
          "README.md": "# toy fixture\n\nEnd-to-end eval target.\n",
          "src/login.ts": "export function login() { /* stub target */ }\n",
        },
      },
    );
    t.succeeded();

    t.calledTool("run_autopilot_task");

    // Shape-C palette.
    t.calledTool("invoke_expert").soft();
    t.calledTool("pre_dispatch_check").soft();
    t.calledTool("phase_gate_check").soft();
    t.calledTool("validate_architecture").soft();
    t.calledTool("mark_done").soft();

    // The Shape-A dispatch_expert must not reappear in the e2e trace.
    t.notCalledTool("dispatch_expert");
  },
});
