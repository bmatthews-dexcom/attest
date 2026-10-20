import { defineEval, includes } from "@cursor/bdk/evals";

/**
 * End-to-end smoke eval for the complexity-analyzer expert.
 *
 * Fixture is a trivial module with one planted deeply-nested function that
 * breaches METHODOLOGY Pass 1 thresholds (nesting > 4). The expert should
 * ground on attest-mcp, read it, and report at least one finding before
 * calling submit-report.
 */
process.env.ATTEST_MCP_STUB = "1";

const INPUT = {
  task_id: "T-COMPLEX-SMOKE-001",
  goal: "Flag functions exceeding METHODOLOGY Pass 1 thresholds in the planted-defect module.",
  current_phase: "phase-5-review",
  context_refs: ["./fixtures/deep-nest.ts"],
  prior_findings: [],
  constraints: { max_findings: 5 },
};

export default defineEval({
  description:
    "complexity-analyzer loads its persona via attest-mcp, scans the target, and submits a structured report.",
  tags: ["smoke", "complexity-analyzer", "code-review"],
  timeoutMs: 180_000,
  async test(t) {
    await t.send(JSON.stringify(INPUT));
    t.succeeded();
    t.calledTool("get_persona");
    t.calledTool("submit-report");
    t.check(t.reply ?? "", includes(/complexity|nesting|function/i)).soft();
  },
});
