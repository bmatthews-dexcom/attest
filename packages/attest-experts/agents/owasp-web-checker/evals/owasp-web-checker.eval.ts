import { defineEval, includes } from "@cursor/bdk/evals";

/**
 * Schema-level smoke eval for the owasp-web-checker expert.
 *
 * Flips `ATTEST_MCP_STUB=1` so the bundled stub MCP serves the canonical attest-mcp
 * tools (including `get_protocol` for OWASP_METHODOLOGY), then asserts the agent
 * calls `get_persona`, attempts at least one `run_validator`, and submits a
 * structured report via `submit-report`. A trivial semgrep-runner prior finding is
 * supplied so the intake does not short-circuit on the "missing SEMGREP_FINDINGS"
 * blocker.
 */
process.env.ATTEST_MCP_STUB = "1";

const INPUT = {
  task_id: "T-SEC-OWASP-SMOKE-001",
  goal: "Walk A01-A10 across the trivial fixture, correlating with the prior semgrep pass.",
  current_phase: "phase-5-review",
  context_refs: ["./fixtures/trivial"],
  prior_findings: [
    {
      expert: "semgrep-runner",
      summary: "No high-severity semgrep findings in the trivial fixture.",
      artifact: "docs/security/SEMGREP_FINDINGS_fixture.md",
      severity: "low" as const,
    },
  ],
  constraints: { max_findings: 10 },
};

export default defineEval({
  description:
    "owasp-web-checker loads its attest persona, runs the owasp-web validator, and submits a structured report.",
  tags: ["smoke", "security", "owasp-web-checker"],
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
