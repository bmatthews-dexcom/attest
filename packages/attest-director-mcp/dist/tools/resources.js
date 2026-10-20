import {
  ResourceTemplate
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { directorKv } from "../kv/namespace.js";
function registerResources(server, ctx) {
  server.registerResource(
    "director-brief-completion",
    new ResourceTemplate("attest-director://briefs/{briefId}/completion.json", {
      list: void 0
    }),
    {
      description: "Completion report for a role brief \u2014 what the CEO reconciles on its cron tick.",
      mimeType: "application/json"
    },
    async (uri, params) => {
      const briefId = String(params.briefId ?? "");
      const payload = await ctx.kv.get(directorKv.completionResource(briefId));
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(payload ?? null, null, 2)
          }
        ]
      };
    }
  );
  server.registerResource(
    "director-expert-summary",
    new ResourceTemplate("attest-director://experts/{expertId}/summary.json", {
      list: void 0
    }),
    {
      description: "Live expert summary (chief-visible) \u2014 the catalog surface for Director-created experts.",
      mimeType: "application/json"
    },
    async (uri, params) => {
      const expertId = String(params.expertId ?? "");
      const payload = await ctx.kv.get(directorKv.expertSummaryResource(expertId));
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(payload ?? null, null, 2)
          }
        ]
      };
    }
  );
}
export {
  registerResources
};
//# sourceMappingURL=resources.js.map
