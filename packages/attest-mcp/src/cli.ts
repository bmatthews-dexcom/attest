#!/usr/bin/env node
/**
 * cli.ts — stdio entry point for the attest-mcp server.
 *
 * Usage (from an MCP client config, e.g. .cursor/mcp.json):
 *
 *   {
 *     "mcpServers": {
 *       "attest": {
 *         "command": "npx",
 *         "args": ["-y", "@bpmforge/attest-mcp"],
 *         "env": { "ATTEST_TARGET_ROOT": "${workspaceFolder}" }
 *       }
 *     }
 *   }
 *
 * Flags (optional; env vars are the primary configuration surface):
 *   --inventory      print the tool/resource/prompt inventory and exit (no server)
 *   --validators     list every validator tool and exit
 *   --version        print version and exit
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer, serverInventory, SERVER_VERSION } from "./server.js";
import { attestRoot } from "./sources.js";
import { listValidators } from "./validators/catalog.js";

async function main() {
  const argv = process.argv.slice(2);

  if (argv.includes("--version") || argv.includes("-v")) {
    process.stdout.write(SERVER_VERSION + "\n");
    return;
  }

  if (argv.includes("--inventory")) {
    const inv = serverInventory();
    const root = attestRoot();
    process.stdout.write(
      JSON.stringify(
        {
          server: "attest",
          version: SERVER_VERSION,
          attestRoot: root.root,
          origin: root.origin,
          inventory: inv,
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  if (argv.includes("--validators")) {
    for (const v of listValidators()) {
      process.stdout.write(`${v.toolName}\t${v.category}\t${v.id}\n`);
    }
    return;
  }

  const server = buildServer();
  const transport = new StdioServerTransport();

  // Catch unhandled rejections so one bad tool call never kills the server.
  process.on("unhandledRejection", (reason) => {
    process.stderr.write(
      `[attest-mcp] unhandledRejection: ${
        reason instanceof Error ? reason.stack ?? reason.message : String(reason)
      }\n`,
    );
  });

  await server.connect(transport);
  // The MCP SDK keeps the event loop alive via the stdio transport; no
  // explicit wait needed here.
}

main().catch((err) => {
  process.stderr.write(
    `[attest-mcp] fatal: ${
      err instanceof Error ? err.stack ?? err.message : String(err)
    }\n`,
  );
  process.exit(1);
});
