/**
 * Authoritative registry of every expert this pack exposes.
 *
 * Expert id convention: kebab-case derived from the attest source filename
 * (minus `.md`). The sibling `@bpmforge/attest-mcp` exposes the same ids via
 * `list_experts` and `attest://experts/<id>` — coordinate changes.
 *
 * The registry is checked into git (`experts.generated.json`) so other
 * packages (`attest-mcp`, `attest-conductor`) can read it without pulling in
 * TypeScript tooling. Regenerate via `npm run sync-stubs`.
 */

export type ExpertCluster =
  | "primary"
  | "primary-subagent"
  | "security"
  | "code-review"
  | "performance"
  | "game"
  | "onboarding";

export type ExpertStatus = "concrete" | "stub";

export interface ExpertMetadata {
  /** Kebab-case id. Matches `attest://experts/<id>` on the MCP side. */
  id: string;
  /** Attest source file path under the attest repo root. */
  source: string;
  /** Which cluster this expert belongs to. */
  cluster: ExpertCluster;
  /** `concrete` ships a real BDK agent; `stub` refuses with "not yet ported". */
  status: ExpertStatus;
  /** One-liner used in the BDK agent `description` and the stub refusal. */
  summary: string;
}

/**
 * The three Phase 1 concrete experts picked to prove the pattern across
 * clusters. See the pack README for selection rationale.
 */
export const CONCRETE_EXPERTS: ReadonlyArray<ExpertMetadata> = [
  {
    id: "security-auditor",
    source: "agents/security-auditor.md",
    cluster: "security",
    status: "concrete",
    summary:
      "Security audit coordinator — Semgrep SAST, OWASP Web/LLM Top 10, threat modeling, secrets, cloud/IaC, dependencies. Runs the attest validator catalog over the target.",
  },
  {
    id: "code-reviewer",
    source: "agents/code-reviewer.md",
    cluster: "code-review",
    status: "concrete",
    summary:
      "Code health audit coordinator — reads a diff / module, produces compound-risk findings (complexity, duplication, error-handling, type-safety, dead code, anti-slop). Report-only, no writes.",
  },
  {
    id: "landscape-mapper",
    source: "agents/sdlc/onboard/landscape-mapper.md",
    cluster: "onboarding",
    status: "concrete",
    summary:
      "Onboarding specialist — reads an unfamiliar codebase (README, package manifests, source tree, git hotspots) and produces LANDSCAPE.md orientation report.",
  },
  // --- Phase 2 code-review cluster port (feat/attest-experts-code-review-cluster) ---
  // The five always-run specialists dispatched by `code-reviewer` across
  // Pass 1 (complexity / duplication / error-handling) and Pass 2
  // (type-safety / dead-code). Rationale: all five are the most-used
  // code-review-cluster experts per `agents/code-reviewer.md` (every review
  // runs them). The remaining 3 (pattern-consistency-checker,
  // anti-slop-auditor, code-health-synthesizer) stay as Phase 2 stubs.
  {
    id: "complexity-analyzer",
    source: "agents/code-review/complexity-analyzer.md",
    cluster: "code-review",
    status: "concrete",
    summary:
      "Code complexity specialist — cyclomatic complexity, cognitive complexity, function length, nesting depth. Runs lizard/radon/complexity tools plus manual analysis per METHODOLOGY Pass 1.",
  },
  {
    id: "duplication-detector",
    source: "agents/code-review/duplication-detector.md",
    cluster: "code-review",
    status: "concrete",
    summary:
      "Duplication and DRY specialist — copy-paste detection, near-duplicates, R-19 (repeated logic blocks). Uses jscpd / fdupes / PMD-CPD per METHODOLOGY Pass 2; the #1 driver of AI-assisted tech debt (GitClear 2025).",
  },
  {
    id: "error-handling-auditor",
    source: "agents/code-review/error-handling-auditor.md",
    cluster: "code-review",
    status: "concrete",
    summary:
      "Error handling and silent failure specialist — empty catch blocks, exception-driven control flow, swallowed errors, serial awaits vs Promise.all. Enforces R-01 through R-04 per METHODOLOGY Pass 3.",
  },
  {
    id: "type-safety-checker",
    source: "agents/code-review/type-safety-checker.md",
    cluster: "code-review",
    status: "concrete",
    summary:
      "Type safety and invariant specialist — any-escapes, non-null assertions without guards, type assertions, strict-mode compliance (TS / Python / Rust). Runs tsc / mypy / grep tripwires per METHODOLOGY Pass 4.",
  },
  {
    id: "dead-code-detector",
    source: "agents/code-review/dead-code-detector.md",
    cluster: "code-review",
    status: "concrete",
    summary:
      "Dead and unutilized code specialist — unimplemented stubs, functions defined but never called, unused exports, orphan files, unreachable branches, disconnected pipelines. Tools: knip / ts-prune / vulture / staticcheck plus reference-count grep.",
  },
];

export const CONCRETE_IDS = new Set(CONCRETE_EXPERTS.map((e) => e.id));
