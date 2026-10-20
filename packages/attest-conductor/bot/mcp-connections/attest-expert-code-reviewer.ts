import { defineConnection } from "@cursor/bdk/connections";

/**
 * Peer MCP connection to the attest-experts code-reviewer BDK agent.
 *
 * See `./security-auditor.ts` for the resolution model. Slug mirrors
 * `attest-expert-${meta.id}` in attest-experts' expert-factory.
 */
export default defineConnection({
  agent: "attest-expert-code-reviewer",
  description:
    "Delegate code-health audits (complexity, duplication, error-handling, type-safety, dead code, anti-slop) to the attest-expert-code-reviewer BDK agent.",
});
