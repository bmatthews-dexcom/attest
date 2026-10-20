import { defineTool } from "@cursor/bdk/tools";
import * as z from "zod/v4";

export default defineTool({
  description:
    "Render the Director help card — list the `/director` subcommands and show the current autonomy mode. Call this when the user says `/director` with no args.",
  effect: "read",
  inputSchema: z.object({}),
  async execute(_input, _ctx) {
    return {
      autonomyMode: "draft-and-approve",
      autoForRepeatRole: false,
      commands: [
        {
          verb: "/director create <role> [--example <path>] [--urgency normal|urgent]",
          what: "Open Phase 1 for a new role brief",
        },
        { verb: "/director status [<brief-id>]", what: "Summarize brief / expert / refinement state" },
        { verb: "/director approve <id>", what: "Approve a draft or refinement" },
        { verb: "/director deny <id> [--reason \"...\"]", what: "Reject with critique" },
        { verb: "/director sweep [<expert-id>]", what: "Phase-6 monitor run" },
        { verb: "/director refine <expert-id> [--reason \"...\"]", what: "Open a refinement proposal" },
        { verb: "/director set-autonomy <mode>", what: "Change autonomy mode (one mode in Phase 1)" },
      ],
      note: "Phase-1 autonomy = `draft-and-approve`. `auto-for-repeat-role` is designed-in as a flag (default false); flipping requires explicit MCP elicitation.",
    };
  },
});
