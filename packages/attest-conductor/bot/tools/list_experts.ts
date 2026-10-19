import { defineTool } from "@cursor/bdk/tools";
import * as z from "zod/v4";
import {
  DEFAULT_EXPERT_REGISTRY,
  resolveExpertMode,
} from "../lib/experts-registry.js";

type ExpertStatus = {
  id: string;
  description: string;
  invocationHint: string;
  mode: "stub" | "peer" | "http";
  modeDetails: Record<string, string>;
};

export default defineTool({
  description:
    "List the expert BDK agents the conductor knows how to dispatch. The real routing table lives in attest-mcp (`route_goal`); this is the conductor's local view of what dispatch_expert can call today — plus whether each expert is wired as stub / peer / http.",
  effect: "read",
  inputSchema: z.object({}),
  async execute(): Promise<{ experts: ExpertStatus[] }> {
    const experts: ExpertStatus[] = DEFAULT_EXPERT_REGISTRY.map((entry) => {
      const mode = resolveExpertMode(entry.id);
      const details: Record<string, string> = {};
      if (mode.kind === "peer") details.peerSlug = mode.slug;
      if (mode.kind === "http") details.url = mode.url;
      return {
        id: entry.id,
        description: entry.description,
        invocationHint: entry.invocationHint,
        mode: mode.kind,
        modeDetails: details,
      };
    });
    return { experts };
  },
});
