#!/usr/bin/env node
/**
 * cli.ts — stdio entry point for the attest-director MCP server.
 *
 * Resolved via a local workspace sibling or `./node_modules/.bin/attest-director-mcp`.
 * **Never** `npx -y`: Bradford's distribution constraint forbids any npm
 * registry fetch for the Director surface.
 *
 * Flags:
 *   --inventory    print the tool/resource inventory and exit (no server)
 *   --version      print version and exit
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer, SERVER_VERSION, serverInventory } from "./server.js";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.includes("--version") || argv.includes("-v")) {
    process.stdout.write(SERVER_VERSION + "\n");
    return;
  }

  if (argv.includes("--inventory")) {
    process.stdout.write(JSON.stringify(serverInventory(), null, 2) + "\n");
    return;
  }

  const { server } = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  const close = async () => {
    try {
      await server.close();
    } catch {
      // intentionally quiet — stdio clients just close the stream
    }
    process.exit(0);
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}

main().catch((err) => {
  process.stderr.write(`attest-director-mcp fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
