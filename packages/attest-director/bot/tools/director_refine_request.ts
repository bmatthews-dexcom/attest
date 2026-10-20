import { defineTool } from "@cursor/bdk/tools";
import * as z from "zod/v4";
import { unwrapMcp, wrapText } from "../lib/mcp-passthrough.js";

export default defineTool({
  description:
    "`/director refine <expert-id>` entry — open a refinement proposal on the sibling MCP. Caller must supply the persona diff (≤100 lines per the agent-self-edit Promotion Gate cap), a 'why this helps' rationale, and a rollback plan. The actual approval happens through a separate `/director approve <ref-id>`.",
  effect: "write",
  inputSchema: z.object({
    expertId: z.string().min(1),
    trigger: z
      .enum([
        "eval-regression",
        "edit-distance-spike",
        "explicit-user-request",
        "director-judgment-pass",
      ])
      .default("explicit-user-request"),
    triggerDetail: z.string().default("explicit user request via /director refine"),
    personaDiff: z.string().min(1),
    whyItHelps: z.string().min(1),
    rollbackPlan: z.string().min(1),
  }),
  async execute(input, ctx) {
    const raw = await ctx.host.mcp.callTool("attest-director-mcp", "director.refine", {
      expertId: input.expertId,
      trigger: input.trigger,
      triggerDetail: input.triggerDetail,
      personaDiff: input.personaDiff,
      whyItHelps: input.whyItHelps,
      rollbackPlan: input.rollbackPlan,
    });
    return wrapText(unwrapMcp(raw));
  },
});
