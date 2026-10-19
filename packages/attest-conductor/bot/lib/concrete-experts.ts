/**
 * The attest-experts BDK pack ships Phase-1 as three concrete experts +
 * 81 Phase-2 stub agents that only expose a `refuse-not-ported` tool.
 * The conductor needs to know which is which so that a dispatch to a
 * stub expert short-circuits with a structured error (status
 * "not_ported") instead of waiting for a peer that cannot actually
 * handle the goal.
 *
 * Keep this set in sync with `packages/attest-experts/lib/expert-registry.ts`
 * (`CONCRETE_EXPERTS`). A follow-up could pull this from `list_experts` if
 * attest-mcp starts advertising `status: "concrete" | "stub"`, but today
 * attest-mcp exposes every primary id uniformly; the concrete-vs-stub
 * axis lives on the attest-experts side only.
 */
export const CONCRETE_EXPERT_IDS: ReadonlySet<string> = new Set([
  "security-auditor",
  "code-reviewer",
  "landscape-mapper",
]);

/**
 * Derive the BDK agent slug attest-experts publishes for the given expert
 * id. Mirrors `defineExpert({ name: "attest-expert-<id>" })` in
 * `packages/attest-experts/lib/expert-factory.ts`.
 */
export function peerSlugForExpert(expertId: string): string {
  return `attest-expert-${expertId}`;
}

export function isConcreteExpert(expertId: string): boolean {
  return CONCRETE_EXPERT_IDS.has(expertId);
}
