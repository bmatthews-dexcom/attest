import { defineConnection } from "@cursor/bdk/connections";

/**
 * Peer MCP connection to the attest-experts landscape-mapper BDK agent.
 *
 * See `./security-auditor.ts` for the resolution model. Slug mirrors
 * `attest-expert-${meta.id}` in attest-experts' expert-factory.
 */
export default defineConnection({
  agent: "attest-expert-landscape-mapper",
  description:
    "Delegate landscape-mapping / codebase-onboarding units to the attest-expert-landscape-mapper BDK agent.",
});
