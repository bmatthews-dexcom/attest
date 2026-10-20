import { defineTool } from "@cursor/bdk/tools";
import * as z from "zod/v4";
import { unwrapMcp, wrapText } from "../lib/mcp-passthrough.js";

export default defineTool({
  description:
    "Run the Phase-6 sweep on all live experts (or just `<expert-id>` when supplied). Re-runs stored fixtures, inspects edit-distance signals, and surfaces refinement proposals if primary/secondary metrics breach bar. Does not auto-apply anything — refinements still go through the explicit approval card.",
  effect: "write",
  inputSchema: z.object({
    expertId: z.string().optional(),
  }),
  async execute(input, ctx) {
    const raw = await ctx.host.mcp.callTool("attest-director-mcp", "director.sweep", {
      expertId: input.expertId,
    });
    return wrapText(unwrapMcp(raw));
  },
});
