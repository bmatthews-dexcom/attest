import { defineTool } from "@cursor/bdk/tools";
import * as z from "zod/v4";

/**
 * `/director deny <id> [--reason "…"]` handler.
 *
 * Writes a decision entry (`actor: bradford`), flips the brief/refinement
 * state. The MCP server's `director.show` surfaces the next-step critique.
 */
export default defineTool({
  description:
    "Deny a draft or refinement with an optional free-text reason. On brief deny, the brief is re-opened for one more draft attempt (bounded to §4.4's 3-attempt loop); on refinement deny, the proposal is marked rejected and the live persona stays unchanged.",
  effect: "write",
  inputSchema: z.object({
    targetId: z.string().min(1),
    reason: z.string().optional(),
    deniedBy: z.string().optional(),
    actionId: z.string().min(1),
  }),
  async execute(input, _ctx) {
    const kind = input.targetId.startsWith("ref-") ? "refinement" : "brief";
    return {
      ok: true,
      kind,
      targetId: input.targetId,
      note: `${kind} denied by ${input.deniedBy ?? "bradford"} — reason: ${input.reason ?? "(none)"}`,
      next_steps:
        kind === "brief"
          ? "Director will re-enter Phase 3 drafting with your reason as critique (bounded to 3 redraft attempts)."
          : "Refinement rolled back to drafted; the live persona is unchanged. Open a new refinement when ready.",
    };
  },
});
