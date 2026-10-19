/**
 * Registry of expert BDK agents the conductor can dispatch.
 *
 * **Default: stub mode.** `dispatch_expert` returns canned responses that
 * are good enough for the eval loop and local dev before the sibling
 * `packages/attest-experts/` package publishes real agent slugs.
 *
 * **Peer mode.** When the attest-experts worker lands and the experts are
 * mounted on the same serve host, override per expert with
 * `ATTEST_EXPERT_<ID>_PEER=<slug>` so `dispatch_expert` calls
 * `host.mcp.callTool(<slug>, "ask", { message })`. Each referenced slug
 * must also be authored as a peer MCP connection file under
 * `bot/mcp-connections/` so the serve host can address it.
 *
 * **HTTP mode (fallback).** `ATTEST_EXPERT_<ID>_URL=https://…` points
 * at a deployed BDK agent reachable over HTTP; `dispatch_expert` POSTs the
 * message to `<URL>/v1/session`. Used only when the experts are not on
 * the same serve host.
 *
 * The <ID> part of the env name is the expert id upper-cased with `-`
 * replaced by `_` (e.g. `security-reviewer` → `SECURITY_REVIEWER`).
 */

export type ExpertMode =
  | { kind: "stub" }
  | { kind: "peer"; slug: string }
  | { kind: "http"; url: string };

export type ExpertRegistryEntry = {
  id: string;
  description: string;
  invocationHint: string;
};

/**
 * The canonical expert list the conductor's prompt + stub route against.
 * The real list lives in attest-mcp's `route_goal` tool; this is only used
 * to validate dispatch inputs and to render the `list_experts` tool
 * output. Keep in sync with the sibling `packages/attest-experts/`.
 */
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

export function expertEnvKey(expertId: string, suffix: "PEER" | "URL"): string {
  const normalized = expertId.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return `ATTEST_EXPERT_${normalized}_${suffix}`;
}

export function resolveExpertMode(expertId: string, env: NodeJS.ProcessEnv = process.env): ExpertMode {
  const peer = env[expertEnvKey(expertId, "PEER")];
  if (peer && peer.trim() !== "") {
    return { kind: "peer", slug: peer.trim() };
  }
  const url = env[expertEnvKey(expertId, "URL")];
  if (url && url.trim() !== "") {
    return { kind: "http", url: url.trim() };
  }
  return { kind: "stub" };
}

export function knownExpertIds(): string[] {
  return DEFAULT_EXPERT_REGISTRY.map((e) => e.id);
}

export function findExpert(expertId: string): ExpertRegistryEntry | undefined {
  return DEFAULT_EXPERT_REGISTRY.find((e) => e.id === expertId);
}
