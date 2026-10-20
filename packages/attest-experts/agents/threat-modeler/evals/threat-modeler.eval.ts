import { defineEval, includes } from "@cursor/bdk/evals";

/**
 * Schema-level smoke eval for the threat-modeler expert.
 *
 * Flips `ATTEST_MCP_STUB=1` so the bundled stub MCP serves the canonical attest-mcp
 * tools (including `get_protocol` for OWASP_METHODOLOGY), then asserts the agent
 * calls `get_persona`, attempts at least one `run_validator` (threat-model over the
 * fixture architecture), and submits a structured report via `submit-report`.
 */
process.env.ATTEST_MCP_STUB = "1";

const INPUT = {
  task_id: "T-SEC-TM-SMOKE-001",
  goal: "STRIDE pass over the trivial fixture architecture: DFD, per-component threats, mitigation map.",
  current_phase: "phase-5-review",
  context_refs: ["./fixtures/trivial", "docs/design/ARCHITECTURE.md"],
  prior_findings: [
    {
      expert: "semgrep-runner",
      summary: "No critical SAST findings in the trivial fixture.",
      artifact: "docs/security/SEMGREP_FINDINGS_fixture.md",
      severity: "low" as const,
    },
  ],
  constraints: { max_findings: 10 },
};

export default defineEval({
  description:
    "threat-modeler loads its attest persona, runs the threat-model validator, and submits a structured report.",
  tags: ["smoke", "security", "threat-modeler"],
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
