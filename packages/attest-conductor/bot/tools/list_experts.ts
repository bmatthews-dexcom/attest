import { defineTool } from "@cursor/bdk/tools";
import * as z from "zod/v4";
import { DEFAULT_EXPERT_REGISTRY } from "../lib/experts-registry.js";

type ExpertSummary = {
  id: string;
  description: string;
  invocationHint: string;
};

export default defineTool({
  description:
    "List expert ids the conductor is aware of locally. Under Shape C, the authoritative catalog lives in attest-mcp's `list_experts`; this tool returns a cosmetic fallback the Ralph prompt uses as a hint when the real catalog is not available. Call attest-mcp's `list_experts` for the true routing table (which expert runs in-process vs sandbox).",
  effect: "read",
  inputSchema: z.object({}),
  async execute(): Promise<{ experts: ExpertSummary[] }> {
    return {
      experts: DEFAULT_EXPERT_REGISTRY.map((entry) => ({
        id: entry.id,
        description: entry.description,
        invocationHint: entry.invocationHint,
      })),
    };
  },
});
