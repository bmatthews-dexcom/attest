import { EVAL_PASS_BAR } from "../schema/draft.js";
async function runEval(input) {
  const judge = input.judge ?? defaultLexicalJudge;
  const scores = [];
  for (const f of input.fixtures) {
    const candidate = await input.runExpert(f);
    const result = await judge({ fixture: f, candidateOutput: candidate });
    const bar = input.passBar ?? EVAL_PASS_BAR;
    scores.push({
      fixtureId: f.id,
      score: result.score,
      passed: result.score >= bar,
      judgeTrace: result.trace,
      rubricNotes: f.expectedRubric
    });
  }
  const passCount = scores.filter((s) => s.passed).length;
  const passRate = scores.length === 0 ? 0 : passCount / scores.length;
  const failingFixtures = scores.filter((s) => !s.passed).map((s) => s.fixtureId);
  const wholesaleFail = passRate === 0 && scores.length >= 2;
  return {
    scores,
    passRate,
    passBar: input.passBar ?? EVAL_PASS_BAR,
    passed: passRate >= (input.passBar ?? EVAL_PASS_BAR),
    failingFixtures,
    wholesaleFail
  };
}
const defaultLexicalJudge = async ({
  fixture,
  candidateOutput
}) => {
  const out = (candidateOutput ?? "").trim();
  if (!out) {
    return { score: 0, trace: "candidate output empty" };
  }
  const rubricTokens = (fixture.expectedRubric ?? "").toLowerCase().split(/\W+/).filter((t) => t.length >= 4);
  const outLower = out.toLowerCase();
  const hits = rubricTokens.filter((t) => outLower.includes(t)).length;
  const presence = rubricTokens.length === 0 ? 1 : hits / rubricTokens.length;
  const hasCitation = /`[^`]+`|https?:\/\/|\b\w+\.(?:ts|js|md|json|py)\b|line\s+\d+/i.test(out);
  const lenScore = Math.min(1, out.length / 200);
  const score = Math.min(1, 0.5 * presence + 0.3 * (hasCitation ? 1 : 0) + 0.2 * lenScore);
  return {
    score,
    trace: `presence=${presence.toFixed(2)} citation=${hasCitation ? 1 : 0} length=${lenScore.toFixed(2)}`
  };
};
export {
  defaultLexicalJudge,
  runEval
};
//# sourceMappingURL=judge.js.map
