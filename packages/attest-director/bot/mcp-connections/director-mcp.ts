import { defineConnection } from "@cursor/bdk/connections";

/**
 * MCP connection to the sibling `attest-director-mcp` server.
 *
 * Resolution order (first match wins):
 *
 *  1. `ATTEST_DIRECTOR_MCP_COMMAND=…` (+ optional `..._ARGS`) — spawn an
 *     explicit stdio server. Use this for development or when the sibling
 *     binary lives somewhere non-standard.
 *  2. **Workspace sibling** (default) — `node ./node_modules/.bin/attest-director-mcp`.
 *     The `attest-director` `package.json` declares the sibling
 *     as a `file:` dependency, so `npm install` wires the binary.
 *
 * **Never** `npx --yes attest-director-mcp` — Bradford's
 * distribution constraint forbids any npm registry fetch for the Director
 * surface. The design doc §8.1 restates this verbatim.
 */
const explicitCommand = process.env.ATTEST_DIRECTOR_MCP_COMMAND;

function parseArgsJson(raw: string): string[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) {
      return parsed as string[];
    }
  } catch {
    // fall through
  }
  return null;
}

export default explicitCommand
  ? defineConnection({
      command: explicitCommand,
      args: process.env.ATTEST_DIRECTOR_MCP_ARGS
        ? parseArgsJson(process.env.ATTEST_DIRECTOR_MCP_ARGS) ?? []
        : [],
      advertiseTools: true,
    })
  : defineConnection({
      command: "node",
      args: ["./node_modules/attest-director-mcp/dist/cli.js"],
      advertiseTools: true,
    });
