import { defineConnection } from "@cursor/bdk/connections";

/**
 * Peer MCP connection to the `attest-experts` security-auditor BDK agent.
 *
 * Resolves when both this conductor and `attest-experts`'s
 * security-auditor agent are mounted on the same `bdk serve --mode multi`
 * host (local dev), or when both are deployed under the same Cursor team
 * (managed hosting — Cursor-managed hosting resolves the slug and
 * authenticates the call). The peer URL resolves over loopback at serve
 * start; no credentials.
 *
 * The `agent` field holds the peer's **slug**, which `bdk deploy` sets
 * from `--slug` and defaults to the agent directory basename. The expert
 * ships in `packages/attest-experts/agents/security-auditor/`, so its
 * slug is `security-auditor`. `defineAgent({ name })` in
 * `packages/attest-experts/lib/expert-factory.ts` is kept in lockstep.
 *
 * `invoke_expert` reaches this peer via
 * `host.mcp.callTool("security-auditor", "ask", { message })`. Env var
 * `ATTEST_SECURITY_AUDITOR_PEER` still overrides the slug for cases where
 * the operator wants to point at a different mounted expert (e.g. a
 * staging variant).
 */
export default defineConnection({
  agent: "security-auditor",
  description:
    "Delegate security-audit units to the attest-experts security-auditor BDK agent (Semgrep / OWASP / threat-modeling / secrets / cloud / IaC).",
});
