import { defineTool } from "@cursor/bdk/tools";
import * as z from "zod/v4";
import {
  CreateExpertInputFromCeoSchema,
  CreateExpertResponseSchema,
  CEO_ENTRY_TOOL_NAME,
  type CreateExpertResponse,
} from "../lib/ceo-contract.js";

export default defineTool({
  description:
    "Call attest-director-mcp's `director.create_expert` to open Phase 1 for a new role brief. Validates the brief locally against the CEO-contract schema before dispatching — bad shapes don't reach the MCP boundary. Returns the server's `{ status, role_brief_id, duplicate_expert_id?, rejection_reason?, eta? }`.",
  effect: "write",
  inputSchema: z.object({
    brief: z.unknown(),
    catalog: z
      .array(
        z.object({
          expertId: z.string().min(1),
          mission: z.string().min(1),
          responsibilitiesText: z.string().optional(),
          capabilityTags: z.array(z.string()).optional(),
        }),
      )
      .optional(),
  }),
  async execute(input, ctx) {
    const parsed = CreateExpertInputFromCeoSchema.safeParse(input.brief);
    if (!parsed.success) {
      return {
        status: "invalid-brief" as const,
        rejection_reason: parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      } satisfies CreateExpertResponse;
    }
    const raw = await ctx.host.mcp.callTool("attest-director-mcp", CEO_ENTRY_TOOL_NAME, {
      brief: parsed.data,
      catalog: input.catalog,
    });
    return parseMcpResponse(raw);
  },
});

function parseMcpResponse(raw: unknown): CreateExpertResponse {
  const unwrapped = unwrapMcpContent(raw);
  const parsed = CreateExpertResponseSchema.safeParse(unwrapped);
  if (parsed.success) return parsed.data;
  return {
    status: "invalid-brief",
    rejection_reason: `director-mcp returned ambiguous payload: ${JSON.stringify(unwrapped).slice(0, 200)}`,
  };
}

function unwrapMcpContent(raw: unknown): unknown {
  if (raw && typeof raw === "object" && "content" in raw) {
    const content = (raw as { content?: unknown }).content;
    if (Array.isArray(content) && content.length > 0 && typeof content[0] === "object") {
      const first = content[0] as { text?: string };
      if (typeof first.text === "string") {
        try {
          return JSON.parse(first.text);
        } catch {
          return first.text;
        }
      }
    }
  }
  return raw;
}
