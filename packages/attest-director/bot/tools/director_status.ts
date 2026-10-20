import { defineTool } from "@cursor/bdk/tools";
import * as z from "zod/v4";
import { unwrapMcp, wrapText } from "../lib/mcp-passthrough.js";

export default defineTool({
  description:
    "Summarize Director state for `/director status`. With no `targetId`, lists all open briefs; with a `targetId`, calls `director.show` on the MCP for that brief / expert / refinement and formats a chat-ready summary.",
  effect: "read",
  inputSchema: z.object({
    targetId: z.string().optional(),
  }),
  async execute(input, ctx) {
    if (!input.targetId) {
      const raw = await ctx.host.mcp.callTool("attest-director-mcp", "director.list_briefs", {});
      return wrapText({ kind: "list", data: unwrapMcp(raw) });
    }
    const kind = guessKind(input.targetId);
    const raw = await ctx.host.mcp.callTool("attest-director-mcp", "director.show", {
      kind,
      id: input.targetId,
    });
    return wrapText({ kind, data: unwrapMcp(raw) });
  },
});

function guessKind(id: string): "brief" | "expert" | "refinement" | "core" {
  if (id === "core") return "core";
  if (id.startsWith("rb-")) return "brief";
  if (id.startsWith("ref-")) return "refinement";
  return "expert";
}
