import { defineEval } from "@cursor/bdk/evals";

/**
 * Integration eval — the whole stack end-to-end.
 *
 * Boots the conductor's `/autopilot` loop against the trivial-repo
 * fixture, with the real `attest-mcp` server as the attest
 * connection and the real `attest-experts` security-auditor
 * reachable as a peer. The eval asserts on the full dispatch loop:
 *
 *   /autopilot "review this trivial fixture for security issues"
 *     ↓
 *   run_autopilot_task (conductor's chat tool)
 *     ↓
 *   route_goal  (attest-mcp)   →  returns expert = "security-auditor"
 *     ↓
 *   dispatch_expert (conductor) → peer attest-expert-security-auditor
 *     ↓                            (consumes the structured report)
 *   phase_gate_check (attest-mcp) → returns plannedValidators[]
 *     ↓
 *   validate_<name> (attest-mcp) → runs one of the planned validators
 *     ↓
 *   advance_phase + mark_done (conductor)
 *
 * **How this differs from `autopilot-e2e.eval.ts`.** The sibling eval runs
 * the loop against the conductor's inline stub for attest-mcp so it stays
 * green with zero external dependencies. This one requires the real
 * attest-mcp (via `ATTEST_MCP_COMMAND`) and the three attest-experts peer
 * connections to be mounted on the same `bdk serve --mode multi` host (or
 * reachable via `ATTEST_EXPERT_<ID>_PEER` env overrides). The CI gate for
 * this eval is `scripts/integration-smoke.mjs --real`, not `bdk eval`
 * alone — see that script for the full process-level boot sequence.
 *
 * Running it directly (requires `CURSOR_API_KEY`):
 *   ATTEST_MCP_COMMAND=npx \
 *   ATTEST_MCP_ARGS='["-y","attest-mcp"]' \
 *     npx @cursor/bdk eval --dir packages/attest-conductor integration/attest-e2e
 */
export default defineEval({
  tags: ["integration", "e2e", "conductor", "cross-package"],
  description:
    "End-to-end: conductor + real attest-mcp + real security-auditor peer drive one autopilot run against trivial-repo.",
  async test(t) {
    await t.send(
      [
        "/autopilot review this trivial fixture for security issues.",
        "Constraints:",
        "- iterationCap 4, maxTurns 4 — enough to let dispatch + validate + gate + done fire;",
        "- treat `evals/fixtures/trivial-repo` as the project root;",
        "- expect route_goal to pick security-auditor; dispatch via",
        "  attest-expert-security-auditor peer; after the report call",
        "  phase_gate_check and run the plannedValidators[] it returns.",
      ].join("\n"),
      {
        workspaceFiles: {
          "README.md":
            "# trivial-repo\n\nIntegration smoke fixture for attest-e2e. See evals/fixtures/trivial-repo/.\n",
          "package.json": JSON.stringify({ name: "trivial-repo", private: true }, null, 2) + "\n",
          "src/login.js":
            "export function login(u, p) { return { ok: !!u && !!p, user: u }; }\n",
        },
      },
    );
    t.succeeded();

    t.calledTool("run_autopilot_task");

    // Full dispatch loop — these are soft because the integration surface
    // depends on which peers are mounted at serve-host time; the hard
    // invariant is that `run_autopilot_task` is called and the task
    // terminates (surfaced by `t.succeeded()`).
    t.calledTool("route_goal").soft();
    t.calledTool("dispatch_expert").soft();
    t.calledTool("phase_gate_check").soft();
    // Any of the per-validator tools counts — the real surface publishes
    // 77, and `plannedValidators[]` picks a handful per phase. Soft so a
    // Phase-2 build that gates on fewer validators doesn't flake the eval.
    t.calledTool("validate_architecture").soft();
    t.calledTool("mark_done").soft();
  },
});
