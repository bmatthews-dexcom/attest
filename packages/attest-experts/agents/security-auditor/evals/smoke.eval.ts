import { defineEval, includes } from "@cursor/bdk/evals";

/**
 * End-to-end smoke eval for the security-auditor expert.
 *
 * Shape:
 *   1. Set `ATTEST_MCP_STUB=1` so `attestMcpConnection()` resolves to the in-package
 *      stub (no sibling `attest-mcp` binary required to run this eval).
 *   2. Send the conductor input blob as the first user message.
 *   3. Assert the agent calls `get_persona` + at least one `run_validator`, then
 *      `submit_report` with `ok: true`.
 */
process.env.ATTEST_MCP_STUB = "1";

const INPUT = {
  task_id: "T-SEC-SMOKE-001",
  goal: "Smoke-check the trivial fixture repo for critical issues.",
  current_phase: "phase-5-review",
  context_refs: ["./fixtures/trivial"],
  prior_findings: [],
  constraints: { max_findings: 10 },
};

export default defineEval({
  description: "security-auditor loads its persona via attest-mcp and submits a structured report.",
  tags: ["smoke", "security-auditor"],
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
