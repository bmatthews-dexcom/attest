import { defineConnection } from "@cursor/bdk/connections";
import { attestStubTools } from "../lib/attest-stub-tools.js";

/**
 * MCP connection to the sibling `@bpmforge/attest-mcp` server.
 *
 * Three modes, selected by env:
 *
 * 1. **Default (no env)** — serve the inline stub in
 *    `bot/lib/attest-stub-tools.ts`. The conductor's loop runs end-to-end,
 *    the eval passes, and no external process is needed. This is what CI
 *    and `bdk eval` use today while the sibling attest-mcp package is still
 *    being built.
 *
 * 2. **`ATTEST_MCP_COMMAND=…` (+ optional `ATTEST_MCP_ARGS` as a JSON
 *    `string[]`)** — spawn a stdio MCP server. Point at the real published
 *    package once it is available:
 *
 *    ```sh
 *    ATTEST_MCP_COMMAND=npx ATTEST_MCP_ARGS='["-y","@bpmforge/attest-mcp"]' \
 *      bdk dev --dir packages/attest-conductor
 *    ```
 *
 * 3. **Local sibling build** — point at the unpublished sibling without
 *    npm publishing:
 *
 *    ```sh
 *    ATTEST_MCP_COMMAND=node \
 *    ATTEST_MCP_ARGS='["../attest-mcp/dist/stdio.js"]' \
 *      bdk dev --dir packages/attest-conductor
 *    ```
 *
 * Credentials: the real attest-mcp needs none (it shells out to validators
 * / git on the local checkout). Use `${NAME}` templates in `env` if that
 * ever changes.
 */

const explicitCommand = process.env.ATTEST_MCP_COMMAND;

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
      args: process.env.ATTEST_MCP_ARGS
        ? (parseArgsJson(process.env.ATTEST_MCP_ARGS) ?? [])
        : [],
      advertiseTools: true,
    })
  : defineConnection({
      tools: attestStubTools,
      description:
        "Inline attest-mcp stub (route_goal, list_validators, validate, phase_gate_check). Replace with the real server by setting ATTEST_MCP_COMMAND.",
    });
