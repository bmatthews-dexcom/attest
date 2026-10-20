import { defineConnection } from "@cursor/bdk/connections";
import { attestCeoMcpStubTools } from "../lib/ceo-mcp-stub-tools.js";

/**
 * MCP connection to the sibling `@bpmforge/attest-ceo-mcp` server.
 *
 * Two modes, selected by env:
 *
 * 1. **Default (no env)** — serve the inline stub in
 *    `bot/lib/ceo-mcp-stub-tools.ts`. The stub calls directly into the
 *    attest-ceo-mcp package source (same `draftPlan`, `extractIntents`,
 *    etc.), so the agent's loop runs end-to-end credential-free. This
 *    is the mode `bdk eval` and `scripts/integration-smoke.mjs --stub`
 *    use.
 *
 * 2. **`ATTEST_CEO_MCP_COMMAND=…` (+ optional `ATTEST_CEO_MCP_ARGS` as
 *    a JSON `string[]`)** — spawn the stdio server. For local workspace
 *    use (not published to npm):
 *
 *    ```sh
 *    ATTEST_CEO_MCP_COMMAND=node \
 *    ATTEST_CEO_MCP_ARGS='["packages/attest-ceo-mcp/dist/cli.js"]' \
 *      npx @cursor/bdk dev --dir packages/attest-ceo
 *    ```
 */

const explicitCommand = process.env.ATTEST_CEO_MCP_COMMAND;

function parseArgsJson(raw: string): string[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) {
      return parsed;
    }
  } catch {
    // fall through
  }
  return null;
}

export default explicitCommand
  ? defineConnection({
      command: explicitCommand,
      args: process.env.ATTEST_CEO_MCP_ARGS
        ? (parseArgsJson(process.env.ATTEST_CEO_MCP_ARGS) ?? [])
        : [],
      advertiseTools: true,
    })
  : defineConnection({
      tools: attestCeoMcpStubTools,
      description:
        "Inline attest-ceo-mcp stub (ingest / extract / draft / approve / dispatch / director). Replace with the real server by setting ATTEST_CEO_MCP_COMMAND.",
    });
