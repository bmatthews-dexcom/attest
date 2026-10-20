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
  // Phase 2 — security cluster wave 1 (always-run under security-auditor).
  {
    id: "semgrep-runner",
    source: "agents/security/semgrep-runner.md",
    cluster: "security",
    status: "concrete",
    summary:
      "SAST specialist — runs semgrep with all registered rule packs (community + custom), triages findings REAL/FP/UNVERIFIED, writes structured finding output. Phase 1 of any security scan. Always runs; other specialists build on its output.",
  },
  {
    id: "secrets-scanner",
    source: "agents/security/secrets-scanner.md",
    cluster: "security",
    status: "concrete",
    summary:
      "Secrets and credentials specialist — finds hardcoded API keys, tokens, passwords, and private keys in source code, configs, and git history. Uses TruffleHog, grep patterns, and git log. Runs in parallel with semgrep-runner.",
  },
  {
    id: "dependency-auditor",
    source: "agents/security/dependency-auditor.md",
    cluster: "security",
    status: "concrete",
    summary:
      "Dependency and supply chain security specialist — CVE scans, SBOM/SCA correlation (syft + grype, CISA KEV), outdated packages, license risk, and slopsquatting detection (AI-hallucinated package names registered by attackers). Runs npm audit, pip-audit, cargo audit, govulncheck. Flags packages added by AI assistants that may not exist or may be malicious.",
  },
  {
    id: "owasp-web-checker",
    source: "agents/security/owasp-web-checker.md",
    cluster: "security",
    status: "concrete",
    summary:
      "OWASP Web Top 10 specialist (2021) — manual A01–A10 checks per category with confidence loop. One context window per category. Reads semgrep-runner output to avoid duplicate findings. Writes per-category OWASP_TRACKER rows.",
  },
  {
    id: "threat-modeler",
    source: "agents/security/threat-modeler.md",
    cluster: "security",
    status: "concrete",
    summary:
      "Threat modeling specialist — STRIDE per component, DFD with trust boundaries, threat rating, and mitigation mapping. Produces THREAT_MODEL.md. Runs after semgrep-runner so it can reference confirmed findings when rating threats.",
  },
];

export const CONCRETE_IDS = new Set(CONCRETE_EXPERTS.map((e) => e.id));
