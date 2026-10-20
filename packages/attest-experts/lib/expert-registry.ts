/**
 * Authoritative registry of every expert this pack exposes.
 *
 * Expert id convention: kebab-case derived from the attest source filename
 * (minus `.md`). The sibling `attest-mcp` exposes the same ids via
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
];

export const CONCRETE_IDS = new Set(CONCRETE_EXPERTS.map((e) => e.id));
