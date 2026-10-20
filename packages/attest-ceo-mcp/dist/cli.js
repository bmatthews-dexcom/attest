#!/usr/bin/env node
/**
 * cli.ts — stdio entry point for the attest-ceo MCP server.
 *
 * Local workspace use (not published to npm; see repo README):
 *
 *   { "mcpServers": { "attest-ceo": {
 *       "command": "node",
 *       "args": ["<repo>/packages/attest-ceo-mcp/dist/cli.js"]
 *   } } }
 *
 * Flags (optional):
 *   --inventory    print the tool / resource inventory and exit
 *   --version      print version and exit
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SERVER_VERSION, buildServer, serverInventory } from "./server.js";
async function main() {
    const argv = process.argv.slice(2);
    if (argv.includes("--version") || argv.includes("-v")) {
        process.stdout.write(SERVER_VERSION + "\n");
        return;
    }
    if (argv.includes("--inventory")) {
        process.stdout.write(JSON.stringify({
            server: "attest-ceo",
            version: SERVER_VERSION,
            inventory: serverInventory(),
        }, null, 2) + "\n");
        return;
    }
    const server = buildServer();
    const transport = new StdioServerTransport();
    process.on("unhandledRejection", (reason) => {
        process.stderr.write(`[attest-ceo-mcp] unhandledRejection: ${reason instanceof Error ? reason.stack ?? reason.message : String(reason)}\n`);
    });
    await server.connect(transport);
}
main().catch((err) => {
    process.stderr.write(`[attest-ceo-mcp] fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    process.exit(1);
});
//# sourceMappingURL=cli.js.map