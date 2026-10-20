import { defineEval, includes } from "@cursor/bdk/evals";

/**
 * End-to-end smoke eval for the dead-code-detector expert.
 *
 * Fixture is a trivial module with one planted stub function nothing calls
 * (defined-but-never-called + unimplemented) and one orphan file. The expert
 * should ground on attest-mcp, run (or stub-run) the five scans, and report
 * at least one finding before calling submit-report.
 */
process.env.ATTEST_MCP_STUB = "1";

const INPUT = {
  task_id: "T-DEAD-SMOKE-001",
  goal: "Run all five dead-code scans on the planted-defect module and surface the stub + orphan.",
  current_phase: "phase-5-review",
  context_refs: ["./fixtures/dead-module/"],
  prior_findings: [],
  constraints: { max_findings: 5 },
};

export default defineEval({
  description:
    "dead-code-detector loads its persona via attest-mcp, runs the five scans, and submits a structured report.",
  tags: ["smoke", "dead-code-detector", "code-review"],
  timeoutMs: 180_000,
  async test(t) {
    await t.send(JSON.stringify(INPUT));
    t.succeeded();
    t.calledTool("get_persona");
    t.calledTool("submit-report");
    t.check(t.reply ?? "", includes(/dead|stub|orphan|unused|never called/i)).soft();
  },
});
