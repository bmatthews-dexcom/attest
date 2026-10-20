import { defineEval, includes } from "@cursor/bdk/evals";

/**
 * End-to-end smoke eval for the duplication-detector expert.
 *
 * Fixture is a trivial two-file module where the same validation block is
 * copy-pasted between handlers. The expert should ground on attest-mcp,
 * identify both locations, and report at least one DRY finding before
 * calling submit-report.
 */
process.env.ATTEST_MCP_STUB = "1";

const INPUT = {
  task_id: "T-DUP-SMOKE-001",
  goal: "Flag copy-paste logic across handlers in the planted-defect module (METHODOLOGY Pass 2 / R-19).",
  current_phase: "phase-5-review",
  context_refs: ["./fixtures/dup-handlers/"],
  prior_findings: [],
  constraints: { max_findings: 5 },
};

export default defineEval({
  description:
    "duplication-detector loads its persona via attest-mcp, scans the target, and submits a structured report.",
  tags: ["smoke", "duplication-detector", "code-review"],
  timeoutMs: 180_000,
  async test(t) {
    await t.send(JSON.stringify(INPUT));
    t.succeeded();
    t.calledTool("get_persona");
    t.calledTool("submit-report");
    t.check(t.reply ?? "", includes(/duplication|dup|duplicate|dry|extract/i)).soft();
  },
});
