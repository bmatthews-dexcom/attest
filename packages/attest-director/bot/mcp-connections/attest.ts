import { defineConnection } from "@cursor/bdk/connections";

/**
 * Optional connection to `@bpmforge/attest-mcp` (the chief's policy +
 * handler-registry MCP). Director's hot-register step calls into this
 * server at Phase 5. When not wired, Director falls back to writing the
 * manifest entry only — the hot-register step is logged as a deferred
 * action in `director:experts:<id>:deployLog`.
 *
 * Resolution: `ATTEST_MCP_COMMAND` (+ `..._ARGS`), otherwise unresolved.
 * Director never `npx -y`s a `@bpmforge/*` package.
 */
const explicitCommand = process.env.ATTEST_MCP_COMMAND;

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

/**
 * When no explicit command is set, we define an inline connection with
 * `tools: []` so the BDK validator sees a connection file but the agent
 * doesn't attempt to spawn a nonexistent binary.
 */
export default explicitCommand
  ? defineConnection({
      command: explicitCommand,
      args: process.env.ATTEST_MCP_ARGS ? parseArgsJson(process.env.ATTEST_MCP_ARGS) ?? [] : [],
      advertiseTools: true,
    })
  : defineConnection({
      tools: {},
      description:
        "attest-mcp not wired (ATTEST_MCP_COMMAND unset). Phase-5 hot-register is deferred and logged for a later retry.",
    });
