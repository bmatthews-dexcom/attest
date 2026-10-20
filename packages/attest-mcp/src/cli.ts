#!/usr/bin/env node
/**
 * cli.ts — stdio entry point for the attest-mcp server.
 *
 * attest-mcp is LOCAL-ONLY — it is not published to the npm registry.
 * Install the workspace from the user's personal GitHub clone of
 * bmatthews-dexcom/attest and point your MCP client at the built bin:
 *
 *   cd ~/code/attest   # or wherever you cloned the repo
 *   npm install        # workspace install at repo root
 *   # then in .cursor/mcp.json (or an equivalent MCP client config):
 *   {
 *     "mcpServers": {
 *       "attest": {
 *         "command": "node",
 *         "args": ["<repo>/packages/attest-mcp/dist/cli.js"],
 *         "env": { "ATTEST_TARGET_ROOT": "${workspaceFolder}" }
 *       }
 *     }
 *   }
 *
 * Flags (optional; env vars are the primary configuration surface):
 *   --inventory          print the tool/resource/prompt inventory and exit
 *   --validators         list every validator tool and exit
 *   --version            print version and exit
 *
 * Subcommands:
 *   policy --kind=<shell|write|mcp>
 *       Fallback entry point for Cursor hook scripts (see sibling
 *       cursor-build-target PR #13's .cursor/hooks/evaluate-*-policy.sh).
 *       Reads a Cursor hook JSON on stdin, writes the Cursor hook
 *       decision JSON on stdout. The dedicated `attest-mcp-policy`
 *       binary (src/cli-policy.ts) is the preferred form; this
 *       subcommand exists so hooks keep working when only the main CLI
 *       is on PATH.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer, serverInventory, SERVER_VERSION } from "./server.js";
import { attestRoot } from "./sources.js";
import { listValidators } from "./validators/catalog.js";
import { registerReferenceHandlers } from "./experts/registry-handlers.js";
import { getPolicyEngine } from "./policy/engine.js";
import { resolveAuditPath } from "./policy/audit.js";
import { runPolicyCli } from "./cli-policy.js";

async function main() {
  const argv = process.argv.slice(2);

  if (argv.includes("--version") || argv.includes("-v")) {
    process.stdout.write(SERVER_VERSION + "\n");
    return;
  }

  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return;
  }

  // Shape-C: `attest-mcp policy --kind=<shell|write|mcp>` subcommand.
  // Kept so the sibling cursor-build-target hook scripts can fall back
  // to the main CLI when the dedicated `attest-mcp-policy` bin is not
  // on PATH. The hook scripts never shell out to `npx -y …` per the
  // local-only install contract.
  if (argv[0] === "policy") {
    const exit = await runPolicyCli(argv.slice(1));
    process.exit(exit);
  }

  if (argv.includes("--inventory")) {
    registerReferenceHandlers();
    const inv = serverInventory();
    const root = attestRoot();
    const engine = getPolicyEngine();
    process.stdout.write(
      JSON.stringify(
        {
          server: "attest",
          version: SERVER_VERSION,
          attestRoot: root.root,
          origin: root.origin,
          policy: {
            mode: engine.mode,
            cedarVersion: engine.cedarVersion,
            policyIds: engine.policyIds,
            auditLogPath: resolveAuditPath(),
          },
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

function printHelp(): void {
  process.stdout.write(
    [
      "attest-mcp — local-only MCP server for the attest SDLC toolchain.",
      "",
      "This package is NOT published to the npm registry. Install it by",
      "running `npm install` at the repo root of your local clone of",
      "bmatthews-dexcom/attest, then invoke the built CLI directly:",
      "",
      "    cd <path-to-attest>",
      "    npm install",
      "    node packages/attest-mcp/dist/cli.js [flags]",
      "",
      "Flags:",
      "  --version          print the server version and exit",
      "  --inventory        print the tool/resource/prompt inventory as JSON",
      "  --validators       list every validator tool and exit",
      "  --help             print this message",
      "",
      "Subcommands:",
      "  policy --kind=<shell|write|mcp>",
      "      Evaluate a Cursor hook JSON on stdin and write the Cursor",
      "      hook decision JSON on stdout. Honours ATTEST_POLICY_MODE",
      "      (OFF | LOG_ONLY | ENFORCE; default ENFORCE). Prefer the",
      "      dedicated `attest-mcp-policy evaluate --kind=<kind>` bin;",
      "      this subcommand is the fallback the sibling cursor-build-",
      "      target hook scripts use when the dedicated bin is missing.",
      "",
      "Running the server (stdio transport):",
      "    node packages/attest-mcp/dist/cli.js",
      "",
      "See packages/attest-mcp/README.md for the full MCP client setup.",
      "",
    ].join("\n"),
  );
}

main().catch((err) => {
  process.stderr.write(
    `[attest-mcp] fatal: ${
      err instanceof Error ? err.stack ?? err.message : String(err)
    }\n`,
  );
  process.exit(1);
});
