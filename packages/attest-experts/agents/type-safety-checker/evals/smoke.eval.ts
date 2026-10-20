import { defineEval, includes } from "@cursor/bdk/evals";

/**
 * End-to-end smoke eval for the type-safety-checker expert.
 *
 * Fixture is a trivial TS module with one `as any` cast and one non-null
 * assertion (`.!`) at a trust boundary. The expert should ground on
 * attest-mcp, inspect the target, and report at least one finding before
 * calling submit-report.
 */
process.env.ATTEST_MCP_STUB = "1";

const INPUT = {
  task_id: "T-TYPE-SMOKE-001",
  goal: "Flag Pass 4 type-safety tripwires (any-escapes, non-null assertions, unsafe assertions) in the planted-defect module.",
  current_phase: "phase-5-review",
  context_refs: ["./fixtures/trust-boundary.ts", "./fixtures/tsconfig.json"],
  prior_findings: [],
  constraints: { max_findings: 5 },
};

export default defineEval({
  description:
    "type-safety-checker loads its persona via attest-mcp, scans the target, and submits a structured report.",
  tags: ["smoke", "type-safety-checker", "code-review"],
  timeoutMs: 180_000,
  async test(t) {
    await t.send(JSON.stringify(INPUT));
    t.succeeded();
    t.calledTool("get_persona");
    t.calledTool("submit-report");
    t.check(t.reply ?? "", includes(/type|any|assertion|strict|cast/i)).soft();
  },
});
