import { defineTool } from "@cursor/bdk/tools";
import * as z from "zod/v4";
import { unwrapMcp, wrapText } from "../lib/mcp-passthrough.js";

export default defineTool({
  description:
    "Set the Director's autonomy config via the sibling MCP. Phase 1 ships one mode (`draft-and-approve`); flipping `auto-for-repeat-role` to true requires an explicit `approvalToken` obtained from an MCP elicitation (fail-closed otherwise).",
  effect: "write",
  inputSchema: z.object({
    mode: z.enum(["draft-and-approve"]).optional(),
    autoForRepeatRole: z.boolean().optional(),
    approvalToken: z.string().optional(),
  }),
  async execute(input, ctx) {
    const raw = await ctx.host.mcp.callTool(
      "attest-director-mcp",
      "director.autonomy-set",
      {
        mode: input.mode,
        autoForRepeatRole: input.autoForRepeatRole,
        approvalToken: input.approvalToken,
      },
    );
    return wrapText(unwrapMcp(raw));
  },
});
