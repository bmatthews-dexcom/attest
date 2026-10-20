/**
 * Phase-4 evaluator — LLM-as-judge scorer (GLIDER-shape stub).
 *
 * The production Director routes scoring through a GLIDER-style judge model
 * (per `docs/attest-director-architecture.md` §4.4). The stub here is a
 * deterministic scorer that:
 *
 *   - Pulls the fixture's `expectedRubric` apart into predicates
 *   - Checks each predicate against the candidate output string
 *     (simple keyword presence + length / shape heuristics)
 *   - Returns a 0..1 score + pass/fail against the Phase-4 bar
 *
 * Tests can swap `judgeFn` with a mock to exercise the eval harness
 * independently of the real judge call.
 */
import type {
  EvalReport,
  EvalScore,
  Fixture,
} from "../schema/draft.js";
import { EVAL_PASS_BAR } from "../schema/draft.js";

export type JudgeFn = (input: {
  fixture: Fixture;
  candidateOutput: string;
}) => Promise<{ score: number; trace: string }>;

export interface RunEvalInput {
  fixtures: Fixture[];
  /**
   * How to produce an output for a given fixture. In the real path this is
   * the expert being evaluated; in tests this is a mock.
   */
  runExpert: (fixture: Fixture) => Promise<string>;
  judge?: JudgeFn;
  passBar?: number;
}

export async function runEval(input: RunEvalInput): Promise<EvalReport> {
  const judge = input.judge ?? defaultLexicalJudge;
  const scores: EvalScore[] = [];
  for (const f of input.fixtures) {
    const candidate = await input.runExpert(f);
    const result = await judge({ fixture: f, candidateOutput: candidate });
    const bar = input.passBar ?? EVAL_PASS_BAR;
    scores.push({
      fixtureId: f.id,
      score: result.score,
      passed: result.score >= bar,
      judgeTrace: result.trace,
      rubricNotes: f.expectedRubric,
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
    wholesaleFail,
  };
}

/**
 * Pure-TS judge that stands in for GLIDER during tests. It scores on:
 *
 *   - keyword presence of rubric terms,
 *   - length-not-empty,
 *   - presence of concrete citations ("`...`", URLs, line numbers).
 *
 * Deterministic, dependency-free, good enough for the Phase-4 eval
 * contract to be exercised end-to-end in tests.
 */
export const defaultLexicalJudge: JudgeFn = async ({
  fixture,
  candidateOutput,
}) => {
  const out = (candidateOutput ?? "").trim();
  if (!out) {
    return { score: 0, trace: "candidate output empty" };
  }

  const rubricTokens = (fixture.expectedRubric ?? "")
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length >= 4);
  const outLower = out.toLowerCase();
  const hits = rubricTokens.filter((t) => outLower.includes(t)).length;
  const presence = rubricTokens.length === 0 ? 1 : hits / rubricTokens.length;

  const hasCitation = /`[^`]+`|https?:\/\/|\b\w+\.(?:ts|js|md|json|py)\b|line\s+\d+/i.test(out);
  const lenScore = Math.min(1, out.length / 200);

  const score = Math.min(1, 0.5 * presence + 0.3 * (hasCitation ? 1 : 0) + 0.2 * lenScore);
  return {
    score,
    trace: `presence=${presence.toFixed(2)} citation=${hasCitation ? 1 : 0} length=${lenScore.toFixed(2)}`,
  };
};
