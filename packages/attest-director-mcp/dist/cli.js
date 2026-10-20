#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer, SERVER_VERSION, serverInventory } from "./server.js";
async function main() {
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
    }
    process.exit(0);
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}
main().catch((err) => {
  process.stderr.write(`attest-director-mcp fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}
`);
  process.exit(1);
});
//# sourceMappingURL=cli.js.map
