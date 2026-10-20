/**
 * MCP resource surface: `attest-director://briefs/<id>/completion.json`
 * and `attest-director://experts/<id>/summary.json`.
 *
 * The CEO polls the completion resource on its cron tick (§10.3). The chief
 * reads the expert summary resource through `attest-mcp`'s catalog.
 */
import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DirectorServerContext } from "../server.js";
import { directorKv } from "../kv/namespace.js";

export function registerResources(
  server: McpServer,
  ctx: DirectorServerContext,
): void {
  server.registerResource(
    "director-brief-completion",
    new ResourceTemplate("attest-director://briefs/{briefId}/completion.json", {
      list: undefined,
    }),
    {
      description:
        "Completion report for a role brief — what the CEO reconciles on its cron tick.",
      mimeType: "application/json",
    },
    async (uri, params) => {
      const briefId = String((params as { briefId?: string }).briefId ?? "");
      const payload = await ctx.kv.get(directorKv.completionResource(briefId));
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(payload ?? null, null, 2),
          },
        ],
      };
    },
  );

  server.registerResource(
    "director-expert-summary",
    new ResourceTemplate("attest-director://experts/{expertId}/summary.json", {
      list: undefined,
    }),
    {
      description:
        "Live expert summary (chief-visible) — the catalog surface for Director-created experts.",
      mimeType: "application/json",
    },
    async (uri, params) => {
      const expertId = String((params as { expertId?: string }).expertId ?? "");
      const payload = await ctx.kv.get(directorKv.expertSummaryResource(expertId));
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(payload ?? null, null, 2),
          },
        ],
      };
    },
  );
}
