/**
 * Shared factory for the `attest-mcp` MCP connection every expert uses.
 *
 * In production: spawns `@bpmforge/attest-mcp` over stdio and advertises its
 * tools (validator catalog) and resources (`attest://experts/<id>`,
 * `attest://protocols/<name>`) to the model.
 *
 * In evals / tests / when the sibling package is not yet published: set
 * `ATTEST_MCP_STUB=1` to swap in {@link stubAttestConnection}, an in-package
 * inline MCP that returns deterministic fixture data so experts load,
 * typecheck, and run against known inputs without a network or an installed
 * `attest-mcp` binary.
 *
 * The expert's `instructions.md` always calls MCP resources / tools by name —
 * neither branch leaks into expert prose.
 */
import { defineConnection } from "@cursor/bdk/connections";
import type { ConnectionDefinition } from "@cursor/bdk";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const STUB_SERVER_PATH = resolve(HERE, "stub-mcp-server.mjs");

/**
 * Entry point used by every `bot/mcp-connections/attest.ts`. The flag is
 * read at discovery time, which runs under `bdk validate` / `bdk info` /
 * `bdk eval` with the current process env.
 */
export function attestMcpConnection(): ConnectionDefinition {
  if (process.env.ATTEST_MCP_STUB === "1") {
    return stubAttestConnection();
  }
  return realAttestConnection();
}

/**
 * Production transport: spawn the sibling `@bpmforge/attest-mcp` server over
 * stdio. The sibling worker owns the exact command — this factory assumes
 * `npx -y @bpmforge/attest-mcp` works once the package is published.
 */
export function realAttestConnection(): ConnectionDefinition {
  const command = process.env.ATTEST_MCP_COMMAND ?? "npx";
  const args = process.env.ATTEST_MCP_ARGS
    ? process.env.ATTEST_MCP_ARGS.split(" ")
    : ["-y", "@bpmforge/attest-mcp"];
  return defineConnection({
    command,
    args,
    advertiseTools: true,
    description:
      "attest-mcp — validator catalog, phase-gate state machine, expert manifest, and shared protocol resources.",
  });
}

/**
 * Spawn the bundled stub MCP server (`lib/stub-mcp-server.mjs`) over stdio.
 * The stub advertises the same tool catalog as the real server and returns
 * deterministic fixture responses — the model never sees a different wire
 * contract between eval and production.
 */
export function stubAttestConnection(): ConnectionDefinition {
  return defineConnection({
    command: process.execPath,
    args: [STUB_SERVER_PATH],
    advertiseTools: true,
    description:
      "attest-mcp stub (ATTEST_MCP_STUB=1) — deterministic fixture responses for evals and bring-up.",
  });
}
