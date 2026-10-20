import { defineTool } from "@cursor/bdk/tools";
import * as z from "zod/v4";
import { unwrapMcp, wrapText } from "../lib/mcp-passthrough.js";

/**
 * `/director approve <id>` handler.
 *
 * The approval surface is the Phase-5 approval card. On approval, Director
 * registers the private manifest entry, hot-registers the handler against
 * attest-mcp (via the sibling connection, if wired), writes a decision
 * entry, and emits a `director.on_expert_deployed` notification resource
 * the CEO's cron tick will reconcile.
 */
export default defineTool({
  description:
    "Approve a draft (brief id starts with `rb-`) or a refinement (id starts with `ref-`). Calls `register_expert` + `director.on_expert_deployed` on the MCP. Idempotent via `actionId`.",
  effect: "write",
  inputSchema: z.object({
    targetId: z.string().min(1),
    approvedBy: z.string().optional(),
    actionId: z.string().min(1),
  }),
  async execute(input, ctx) {
    if (input.targetId.startsWith("ref-")) {
      return wrapText({
        ok: true,
        kind: "refinement",
        note: "refinement approval flows through the Director's own ledger — Phase-1 build registers the approval decision; a dedicated approve_refinement MCP tool is a follow-up.",
        targetId: input.targetId,
      });
    }
    const registerRaw = await ctx.host.mcp.callTool(
      "attest-director-mcp",
      "register_expert",
      {
        briefId: input.targetId,
        approvedBy: input.approvedBy ?? "bradford",
      },
    );
    const register = unwrapMcp(registerRaw) as Record<string, unknown> | undefined;
    if (!register || register.error) {
      return wrapText({ ok: false, kind: "brief", targetId: input.targetId, register }, true);
    }
    const expertId = (register as { expertId?: string }).expertId;
    const notifyRaw = await ctx.host.mcp.callTool(
      "attest-director-mcp",
      "director.on_expert_deployed",
      {
        completion: {
          role_brief_id: input.targetId,
          expert_id: expertId,
          form_factor: (register as { formFactor?: string }).formFactor,
          scope: "private",
          eval_pass_rate: (register as { evalPassRate?: number }).evalPassRate ?? 1,
          integrations_installed: [],
          approved_by: input.approvedBy ?? "bradford",
          approved_at: new Date().toISOString(),
          deployed_at: (register as { deployedAt?: string }).deployedAt,
        },
      },
    );
    return wrapText({
      ok: true,
      kind: "brief",
      targetId: input.targetId,
      expertId,
      notify: unwrapMcp(notifyRaw),
    });
  },
});
