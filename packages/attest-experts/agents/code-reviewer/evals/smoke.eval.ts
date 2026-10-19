import { defineEval, includes } from "@cursor/bdk/evals";

/**
 * End-to-end smoke eval for the code-reviewer expert.
 *
 * Fixture is a trivial 3-line diff with one planted anti-slop defect (a
 * stubbed function that no one calls). The expert should surface it via the
 * dead-code / anti-slop validator wave and report at least one finding.
 */
process.env.ATTEST_MCP_STUB = "1";

const INPUT = {
  task_id: "T-REVIEW-SMOKE-001",
  goal: "Review the planted-defect diff for code-health issues.",
  current_phase: "phase-5-review",
  context_refs: ["./fixtures/planted-defect.diff"],
  prior_findings: [],
  constraints: {},
};

export default defineEval({
  description: "code-reviewer loads its persona, runs validators, and reports structured findings.",
  tags: ["smoke", "code-reviewer"],
  timeoutMs: 180_000,
  async test(t) {
    await t.send(JSON.stringify(INPUT));
    t.succeeded();
    t.calledTool("get_persona");
    t.calledTool("submit-report");
    t.check(t.reply ?? "", includes(/review|finding/i)).soft();
  },
});
