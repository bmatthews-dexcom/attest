import { defineEval, includes } from "@cursor/bdk/evals";

/**
 * Schema-level smoke eval for the dependency-auditor expert.
 *
 * Flips `ATTEST_MCP_STUB=1` so the bundled stub MCP serves the five canonical
 * attest-mcp tools, then asserts the agent calls `get_persona`, attempts at least
 * one `run_validator` (dependency-audit over the fixture), and submits a structured
 * report via `submit-report`.
 */
process.env.ATTEST_MCP_STUB = "1";

const INPUT = {
  task_id: "T-SEC-DEPS-SMOKE-001",
  goal: "Dependency/CVE audit on the trivial fixture repo (manifests + lockfiles).",
  current_phase: "phase-5-review",
  context_refs: ["./fixtures/trivial"],
  prior_findings: [],
  constraints: { max_findings: 10 },
};

export default defineEval({
  description:
    "dependency-auditor loads its attest persona, runs the dependency-audit validator, and submits a structured report.",
  tags: ["smoke", "security", "dependency-auditor"],
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
