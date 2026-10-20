/**
 * CEO ↔ Director contract shim.
 *
 * The CEO calls `director.create_expert({ brief })` on the sibling
 * attest-director-mcp. On completion, Director writes
 * `attest-director://briefs/<id>/completion.json`, which the CEO polls
 * on its cron tick.
 *
 * This file freezes the shape so a CEO-side worker and the Director-side
 * worker can diverge independently without breaking the contract. The
 * schemas here are the Director's local view — the CEO owns its own
 * copy under `attest-ceo-mcp/src/schema/director-handoff.ts` and the
 * two SHOULD stay structurally identical. See §10.1-§10.3 of the
 * design doc for the authoritative shape.
 */
import * as z from "zod/v4";

/**
 * Input the CEO sends on `director.create_expert`. Mirrors
 * `attest-director-mcp` `CreateExpertInputSchema` (the server-authoritative
 * version). Kept here as a Director-side type guard; the server rejects
 * anything that doesn't fit.
 */
export const CreateExpertInputFromCeoSchema = z.object({
  role: z.string().min(1),
  title: z.string().min(1),
  mission: z.string().min(1),
  responsibilities: z.array(z.string().min(1)).min(1),
  typical_inputs: z.array(z.object({ name: z.string(), type: z.string(), example: z.string().optional() })).min(1),
  typical_outputs: z.array(z.object({ name: z.string(), type: z.string(), example: z.string().optional() })).min(1),
  example_task: z.string().min(1),
  domain_context: z.string().optional(),
  urgency: z.enum(["normal", "urgent", "scheduled"]).default("normal"),
  requested_by: z.object({
    source: z.enum(["ceo", "bradford", "director-refinement"]),
    task_id: z.string().optional(),
    requested_by_user: z.string().optional(),
  }),
  requested_capabilities: z.object({
    reads: z.array(z.string()).default([]),
    writes: z.array(z.string()).default([]),
    shell_patterns: z.array(z.string()).default([]),
    network: z.array(z.string()).default([]),
    mcp_tools: z.array(z.string()).default([]),
  }),
  form_factor_preference: z
    .enum(["auto", "skill", "in-process-handler", "sandbox-bdk-agent"])
    .default("auto"),
  required_integrations: z
    .array(
      z.object({
        kind: z.enum(["mcp-server", "library", "cli-tool", "service"]),
        candidates: z.array(z.string().min(1)).min(1),
        install_steps_tbd: z.boolean().default(true),
        notes: z.string().optional(),
      }),
    )
    .default([]),
  golden_set: z
    .array(z.object({ input: z.string(), expected_rubric: z.string(), notes: z.string().optional() }))
    .default([]),
});
export type CreateExpertInputFromCeo = z.infer<typeof CreateExpertInputFromCeoSchema>;

/**
 * Response Director sends back on `director.create_expert`. Keep this
 * freeze-dried: the CEO's reconciler on its cron tick keys off exactly
 * these fields.
 */
export const CreateExpertResponseSchema = z.object({
  status: z.enum(["accepted", "duplicate", "org-mission-rejected", "invalid-brief", "rejected"]),
  role_brief_id: z.string().optional(),
  duplicate_expert_id: z.string().optional(),
  rejection_reason: z.string().optional(),
  eta: z.string().optional(),
  proximity_verdict: z.string().optional(),
});
export type CreateExpertResponse = z.infer<typeof CreateExpertResponseSchema>;

/**
 * CEO reads this resource on its cron tick to reconcile dispatch state.
 * One per brief; written exactly once at Phase 5 approval.
 */
export const CompletionResourceSchema = z.object({
  role_brief_id: z.string().min(1),
  expert_id: z.string().min(1),
  form_factor: z.enum(["skill", "in-process-handler", "sandbox-bdk-agent"]),
  scope: z.enum(["private", "shared"]).default("private"),
  eval_pass_rate: z.number().min(0).max(1),
  integrations_installed: z.array(z.string()).default([]),
  approved_by: z.string().optional(),
  approved_at: z.string().optional(),
  deployed_at: z.string().optional(),
  ceo_task_notified: z.string().optional(),
});
export type CompletionResource = z.infer<typeof CompletionResourceSchema>;

/**
 * MCP tool name the CEO calls. Freeze: changing this breaks the CEO
 * worker's `defineConnection` wiring. See `docs/attest-director-architecture.md`
 * §10.1.
 */
export const CEO_ENTRY_TOOL_NAME = "director.create_expert" as const;

/**
 * MCP tool name the Director calls on CEO notification. The CEO owns the
 * handler; Director calls it after a Phase-5 approval resolves. Freeze.
 */
export const CEO_NOTIFY_TOOL_NAME = "director.on_expert_deployed" as const;

/**
 * MCP resource URIs the CEO reads. Freeze.
 */
export const CEO_RESOURCE_URIS = {
  completion: (briefId: string) => `attest-director://briefs/${briefId}/completion.json`,
  expertSummary: (expertId: string) => `attest-director://experts/${expertId}/summary.json`,
} as const;

/**
 * Env flag the CEO reads to decide whether to call Director. When
 * `ATTEST_DIRECTOR_ENABLED !== "true"` the CEO must handle expert gaps
 * itself (surface to Bradford, don't dispatch).
 */
export const CEO_ENABLED_ENV = "ATTEST_DIRECTOR_ENABLED" as const;
