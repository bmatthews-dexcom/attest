import { defineEval, includes } from "@cursor/bdk/evals";

/**
 * Schema-level smoke eval for the semgrep-runner expert.
 *
 * Shape (mirrors the shared security-auditor smoke eval):
 *   1. Flip `ATTEST_MCP_STUB=1` so `attestMcpConnection()` resolves to the in-package
 *      stub (no sibling `@bpmforge/attest-mcp` binary required).
 *   2. Send the conductor input blob as the first user message.
 *   3. Assert the agent grounded on `get_persona`, attempted at least one
 *      `run_validator`, and submitted a structured report via `submit-report`.
 */
process.env.ATTEST_MCP_STUB = "1";

const INPUT = {
  task_id: "T-SEC-SEMGREP-SMOKE-001",
  goal: "SAST pass over the trivial fixture: produce REAL/FP/UNVERIFIED findings.",
  current_phase: "phase-5-review",
  context_refs: ["./fixtures/trivial"],
  prior_findings: [],
  constraints: { max_findings: 10 },
};

export default defineEval({
  description:
    "semgrep-runner loads its attest persona, runs the semgrep validator, and submits a structured report.",
  tags: ["smoke", "security", "semgrep-runner"],
  timeoutMs: 180_000,
  async test(t) {
    await t.send(JSON.stringify(INPUT));
    t.succeeded();
    t.calledTool("get_persona");
    t.calledTool("run_validator").soft();
    t.calledTool("submit-report");
    t.check(t.reply ?? "", includes(/task[_ ]id/i)).soft();
  },
});
