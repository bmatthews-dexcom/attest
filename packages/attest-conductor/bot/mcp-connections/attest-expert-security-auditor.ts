import { defineConnection } from "@cursor/bdk/connections";

/**
 * Peer MCP connection to the attest-experts security-auditor BDK agent.
 *
 * Resolves when both this conductor and `@bpmforge/attest-experts`'s
 * security-auditor agent are mounted on the same `bdk serve --mode multi`
 * host. The peer URL resolves over loopback at serve start; no credentials.
 *
 * The slug mirrors `defineExpert` in
 * `packages/attest-experts/lib/expert-factory.ts`:
 *   name: `attest-expert-${meta.id}` → `attest-expert-security-auditor`.
 *
 * `dispatch_expert` reaches this peer via `host.mcp.callTool(slug, "ask",
 * { message })`. Env var `ATTEST_EXPERT_SECURITY_AUDITOR_PEER` still
 * overrides the slug for cases where the operator wants to point at a
 * different mounted expert (e.g. a staging variant).
 */
export default defineConnection({
  agent: "attest-expert-security-auditor",
  description:
    "Delegate security-audit units to the attest-expert-security-auditor BDK agent (Semgrep / OWASP / threat-modeling / secrets / cloud / IaC).",
});
