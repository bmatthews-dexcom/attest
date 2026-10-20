import { defineTool } from "@cursor/bdk/tools";
import * as z from "zod/v4";

/**
 * `/director create` entry — extract a draft role brief from the user's
 * free-text ask + an optional example file path. Director confirms the
 * brief with the user before calling `director_create_expert`.
 *
 * Phase-1 stub: produces a deterministic skeleton the model fills in. The
 * production path uses an LLM extraction prompt against the user ask,
 * returning a structured brief the user then edits before confirming.
 */
export default defineTool({
  description:
    "Extract a draft role brief from Bradford's free-text ask + optional example path. Returns a structured skeleton that Bradford confirms via chat before calling `director_create_expert`. Phase-1 stub emits a template with slots the model must fill from the ask.",
  effect: "read",
  inputSchema: z.object({
    role: z.string().min(1),
    ask: z.string().min(1),
    examplePath: z.string().optional(),
    urgency: z.enum(["normal", "urgent"]).default("normal"),
    requestedByUser: z.string().optional(),
  }),
  async execute(input, _ctx) {
    const defaultCapabilities = {
      reads: ["read:fs"],
      writes: ["docs/work/**/*"],
      shell_patterns: [] as string[],
      network: [] as string[],
      mcp_tools: [] as string[],
    };
    return {
      role: input.role,
      title: toTitle(input.role),
      mission: `(TO CONFIRM) Draft mission from ask: ${input.ask.slice(0, 160)}`,
      responsibilities: [
        "(TO CONFIRM) Primary responsibility derived from ask",
        "(TO CONFIRM) Supporting responsibility",
        "(TO CONFIRM) Boundary responsibility",
      ],
      typical_inputs: [{ name: "ask", type: "string", example: input.ask.slice(0, 120) }],
      typical_outputs: [{ name: "report_md", type: "markdown", example: "# report" }],
      example_task: input.ask,
      urgency: input.urgency,
      requested_by: {
        source: "bradford" as const,
        requested_by_user: input.requestedByUser,
      },
      requested_capabilities: defaultCapabilities,
      form_factor_preference: "auto" as const,
      required_integrations: [],
      golden_set: [],
      examplePath: input.examplePath,
      next_step:
        "Review this skeleton; use /director create confirm <role> to persist and advance to Phase 1.",
    };
  },
});

function toTitle(kebab: string): string {
  return kebab
    .split("-")
    .map((p) => (p.length === 0 ? p : p[0]!.toUpperCase() + p.slice(1)))
    .join(" ");
}
