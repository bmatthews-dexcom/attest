/**
 * The one tool stub experts expose: refuses, cites the Phase 2 TODO.
 *
 * Having a real tool (rather than only prose) means the dispatch surface a
 * conductor binds to is identical between concrete and stub experts — same
 * tool name, same error channel — so the only thing the conductor needs to
 * detect is `ok: false, status: "not_ported"`.
 */
import { defineTool } from "@cursor/bdk/tools";
import type { ToolDefinition } from "@cursor/bdk";
import * as z from "zod/v4";

export function notPortedTool(expertId: string): ToolDefinition {
  return defineTool({
    description: `Refuse execution — expert '${expertId}' is not yet ported (Phase 2). The conductor should pick a concrete expert or escalate to the user.`,
    effect: "read",
    inputSchema: z.object({ task_id: z.string().min(1).optional() }),
    async execute({ task_id }) {
      return {
        ok: false,
        status: "not_ported",
        expert_id: expertId,
        task_id: task_id ?? null,
        message: `expert '${expertId}' is not yet ported to this BDK pack (Phase 2 scaffold-only).`,
      };
    },
  }) as ToolDefinition;
}
