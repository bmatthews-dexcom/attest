/**
 * Local fallback expert catalog — Shape C.
 *
 * Under Shape C the authoritative expert list lives in attest-mcp's
 * `list_experts` MCP tool. The conductor's local copy is a cosmetic
 * fallback used only when attest-mcp is unavailable (stub mode) and in
 * the Ralph prompt as a hint catalog. All transport selection
 * (in-process handler vs sandbox BDK agent) is attest-mcp's call — this
 * file carries no env-var resolution, no peer-slug derivation, no mode
 * switching. See `docs/attest-chief-architecture.md` §3.3.
 *
 * The old Shape-A `resolveExpertMode(expertId)` + `ATTEST_EXPERT_*_PEER` /
 * `..._URL` env knobs were removed in favor of attest-mcp's policy-mediated
 * `invoke_expert` which handles sandbox-vs-in-process routing.
 */

export type ExpertRegistryEntry = {
  id: string;
  description: string;
  invocationHint: string;
};

export const DEFAULT_EXPERT_REGISTRY: readonly ExpertRegistryEntry[] = [
  {
    id: "guide",
    description: "Concierge router — triages ambiguous goals.",
    invocationHint: "Give the raw goal and let guide suggest the next skill.",
  },
  {
    id: "security-reviewer",
    description: "Audits for CVEs, auth gaps, dependency risk.",
    invocationHint: "Scope to files / endpoints / dependencies touched by the goal.",
  },
  {
    id: "code-reviewer",
    description: "Reads for dead code, duplication, API drift.",
    invocationHint: "Scope to the diff or files under review.",
  },
  {
    id: "performance",
    description: "Finds hot paths, N+1s, bad complexity.",
    invocationHint: "Attach a benchmark or representative workload if any.",
  },
  {
    id: "test-author",
    description: "Writes/augments tests for the goal's acceptance slice.",
    invocationHint: "Pass the acceptance predicate the tests must cover.",
  },
  {
    id: "docs",
    description: "Owns README / ADR / changelog updates for the slice.",
    invocationHint: "Pass the deliverable list — docs chases those paths.",
  },
];

export function knownExpertIds(): string[] {
  return DEFAULT_EXPERT_REGISTRY.map((e) => e.id);
}

export function findExpert(expertId: string): ExpertRegistryEntry | undefined {
  return DEFAULT_EXPERT_REGISTRY.find((e) => e.id === expertId);
}
