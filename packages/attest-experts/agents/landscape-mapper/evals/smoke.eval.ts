import { defineEval, includes } from "@cursor/bdk/evals";

/**
 * End-to-end smoke eval for the landscape-mapper expert.
 *
 * Fixture is a trivial repo path; the expert should load its persona, call
 * list_validators (to discover `landscape`), and submit a structured report
 * with exactly one `docs/LANDSCAPE.md` artifact.
 */
process.env.ATTEST_MCP_STUB = "1";

const INPUT = {
  task_id: "T-ONBOARD-SMOKE-001",
  goal: "Produce LANDSCAPE.md orientation for this fixture repo.",
  current_phase: "phase-0-onboard",
  context_refs: ["./fixtures/trivial-repo"],
  prior_findings: [],
  constraints: { write_scope: ["docs/"] },
};

export default defineEval({
  description:
    "landscape-mapper loads its persona, surveys the fixture, and reports the LANDSCAPE.md artifact.",
  tags: ["smoke", "landscape-mapper", "onboarding"],
  timeoutMs: 180_000,
  async test(t) {
    await t.send(JSON.stringify(INPUT));
    t.succeeded();
    t.calledTool("get_persona");
    t.calledTool("submit-report");
    t.check(t.reply ?? "", includes(/landscape|orient/i)).soft();
  },
});
