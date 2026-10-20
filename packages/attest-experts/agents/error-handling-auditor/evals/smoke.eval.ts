import { defineEval, includes } from "@cursor/bdk/evals";

/**
 * End-to-end smoke eval for the error-handling-auditor expert.
 *
 * Fixture is a trivial service with one empty catch block (R-01) and one
 * serial-await chain (R-04). The expert should ground on attest-mcp, inspect
 * the target, and report at least one finding before calling submit-report.
 */
process.env.ATTEST_MCP_STUB = "1";

const INPUT = {
  task_id: "T-ERRH-SMOKE-001",
  goal: "Flag R-01 / R-02 / R-03 / R-04 violations in the planted-defect service.",
  current_phase: "phase-5-review",
  context_refs: ["./fixtures/swallow-service.ts"],
  prior_findings: [],
  constraints: { max_findings: 5 },
};

export default defineEval({
  description:
    "error-handling-auditor loads its persona via attest-mcp, scans the target, and submits a structured report.",
  tags: ["smoke", "error-handling-auditor", "code-review"],
  timeoutMs: 180_000,
  async test(t) {
    await t.send(JSON.stringify(INPUT));
    t.succeeded();
    t.calledTool("get_persona");
    t.calledTool("submit-report");
    t.check(t.reply ?? "", includes(/catch|error|swallow|promise\.all|r-?0?[1-4]/i)).soft();
  },
});
