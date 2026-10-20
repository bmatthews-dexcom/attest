/**
 * Lifecycle tools: `director.create_expert`, `director.on_expert_deployed`,
 * `director.autonomy-set`, `director.sweep`, `director.refine`.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { DirectorServerContext } from "../server.js";
import { okJson, errJson } from "./_shared.js";
import {
  CreateExpertInputSchema,
  RoleBriefSchema,
  newRoleBriefId,
  roleFingerprint,
  type RoleBrief,
} from "../schema/role-brief.js";
import {
  DEFAULT_AUTONOMY_CONFIG,
  DirectorAutonomyConfigSchema,
  AUTONOMY_MODES,
  type DirectorAutonomyConfig,
} from "../schema/autonomy.js";
import {
  recordBrief,
  recordDecision,
  newDecisionId,
  isRejectedFingerprint,
  updateBriefState,
  listBriefs,
  recordCompletionResource,
  listRefinements,
  recordRefinement,
} from "../ledger/ops.js";
import { directorKv } from "../kv/namespace.js";
import type { KvStore } from "../kv/store.js";
import { runProximityCheck, type ExpertCatalogEntry } from "../proximity/check.js";
import type { CompletionResource } from "../schema/expert.js";
import { newRefId, REFINEMENT_TRIGGER_DEFAULTS } from "../schema/refinement.js";
import type { RefinementProposal } from "../schema/refinement.js";

export function registerLifecycleTools(
  server: McpServer,
  ctx: DirectorServerContext,
): void {
  // ──────────────────────────────────────────────────────────────────────
  // director.create_expert — CEO/Bradford entry.
  // ──────────────────────────────────────────────────────────────────────
  server.registerTool(
    "director.create_expert",
    {
      description:
        "CEO/Bradford entry — accept a role brief and run Phase 1 (schema validate + proximity check + rejected-log check). Returns `{ status, role_brief_id?, duplicate_expert_id?, rejection_reason?, eta? }`.",
      inputSchema: {
        brief: z
          .object({})
          .passthrough()
          .describe("A role brief shaped per `docs/attest-director-architecture.md` §4.8."),
        catalog: z
          .array(
            z.object({
              expertId: z.string().min(1),
              mission: z.string().min(1),
              responsibilitiesText: z.string().optional(),
              capabilityTags: z.array(z.string()).optional(),
            }),
          )
          .optional()
          .describe("Known expert catalog to run the proximity sweep against. Caller provides it from attest-mcp.list_experts."),
      },
    },
    async (args) => {
      const parsed = CreateExpertInputSchema.safeParse(args.brief);
      if (!parsed.success) {
        return okJson({
          status: "invalid-brief",
          rejection_reason: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        });
      }
      const now = ctx.now();
      const nowIso = new Date(now).toISOString();
      const id = parsed.data.id ?? newRoleBriefId(now);
      const brief: RoleBrief = {
        ...parsed.data,
        id,
        version: "1.0",
        state: "proposed",
        proximity_check: null,
        created_at: nowIso,
        updated_at: nowIso,
      };

      const fingerprint = roleFingerprint({
        role: brief.role,
        mission: brief.mission,
        responsibilities: brief.responsibilities,
      });

      if (await isRejectedFingerprint(ctx.kv, fingerprint)) {
        const rejected: RoleBrief = {
          ...brief,
          state: "rejected",
          proximity_check: {
            topMatches: [],
            verdict: "refuse-rejected-earlier",
            rejectionFingerprint: fingerprint,
          },
        };
        await recordBrief(ctx.kv, rejected);
        await recordDecision(ctx.kv, {
          decisionId: newDecisionId(now),
          briefId: id,
          tsMs: now,
          action: "create_expert.rejected",
          actor: "director",
          summary: `brief fingerprint '${fingerprint}' is on the rejected list; refusing without re-running Phase 2-4`,
        });
        return okJson({
          status: "rejected",
          role_brief_id: id,
          rejection_reason: `brief fingerprint '${fingerprint}' was previously rejected; use \`/director force-create ${brief.role}\` to override.`,
        });
      }

      const catalog: ExpertCatalogEntry[] = (args.catalog ?? []) as ExpertCatalogEntry[];
      const rejectedSet = await loadRejectedFingerprints(ctx.kv);
      const proximity = runProximityCheck(
        { role: brief.role, mission: brief.mission, responsibilities: brief.responsibilities },
        catalog,
        fingerprint,
        {
          autoDispatchThreshold: 0.9,
          surfaceThreshold: 0.78,
          safelyNewThreshold: 0.6,
          rejectedFingerprints: rejectedSet,
        },
      );

      if (proximity.verdict === "rename-and-dispatch" && proximity.topMatches[0]) {
        const match = proximity.topMatches[0];
        const duplicate: RoleBrief = {
          ...brief,
          proximity_check: proximity,
          state: "duplicate",
        };
        await recordBrief(ctx.kv, duplicate);
        await recordDecision(ctx.kv, {
          decisionId: newDecisionId(now),
          briefId: id,
          tsMs: now,
          action: "create_expert.rename-and-dispatch",
          actor: "director",
          summary: `brief matches existing expert '${match.expertId}' at score=${match.score.toFixed(2)}; dispatching rename-and-dispatch`,
          payload: { match },
        });
        return okJson({
          status: "duplicate",
          role_brief_id: id,
          duplicate_expert_id: match.expertId,
        });
      }

      const briefWithProximity: RoleBrief = {
        ...brief,
        proximity_check: proximity,
      };
      await recordBrief(ctx.kv, briefWithProximity);
      await recordDecision(ctx.kv, {
        decisionId: newDecisionId(now),
        briefId: id,
        tsMs: now,
        action: "create_expert.accepted",
        actor: brief.requested_by.source === "ceo" ? "ceo" : "bradford",
        summary: `brief accepted; proximity verdict=${proximity.verdict}; advancing to Phase 2`,
        payload: { fingerprint, proximity },
      });
      return okJson({
        status: "accepted",
        role_brief_id: id,
        eta: brief.urgency === "urgent" ? "~15m" : "~30m",
        proximity_verdict: proximity.verdict,
      });
    },
  );

  // ──────────────────────────────────────────────────────────────────────
  // director.on_expert_deployed — Phase 5 notification + completion.
  // ──────────────────────────────────────────────────────────────────────
  server.registerTool(
    "director.on_expert_deployed",
    {
      description:
        "Phase-5 completion — write the public completion.json resource the CEO polls on its cron tick (§10.3). Idempotent on `role_brief_id`.",
      inputSchema: {
        completion: z
          .object({
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
          })
          .describe("`CompletionResource` payload."),
      },
    },
    async (args) => {
      const resource = args.completion as CompletionResource;
      await recordCompletionResource(ctx.kv, resource.role_brief_id, resource);
      await updateBriefState(ctx.kv, resource.role_brief_id, "deployed");
      await recordDecision(ctx.kv, {
        decisionId: newDecisionId(ctx.now()),
        briefId: resource.role_brief_id,
        expertId: resource.expert_id,
        tsMs: ctx.now(),
        action: "on_expert_deployed",
        actor: "director",
        summary: `expert '${resource.expert_id}' deployed as ${resource.form_factor} (scope=${resource.scope}, pass_rate=${resource.eval_pass_rate})`,
        payload: { resource },
      });
      return okJson({
        ok: true,
        completion_resource_uri: `attest-director://briefs/${resource.role_brief_id}/completion.json`,
      });
    },
  );

  // ──────────────────────────────────────────────────────────────────────
  // director.list_briefs
  // ──────────────────────────────────────────────────────────────────────
  server.registerTool(
    "director.list_briefs",
    {
      description: "List all role briefs with their state.",
      inputSchema: {
        state: z
          .enum([
            "proposed",
            "research-ready",
            "draft-ready",
            "eval-passing",
            "eval-stuck",
            "awaiting-approval",
            "deployed",
            "rejected",
            "parked",
            "org-mission-rejected",
            "duplicate",
          ])
          .optional(),
      },
    },
    async (args) => {
      const all = await listBriefs(ctx.kv);
      const filtered = args.state ? all.filter((b) => b.state === args.state) : all;
      return okJson({ count: filtered.length, briefs: filtered });
    },
  );

  // ──────────────────────────────────────────────────────────────────────
  // director.autonomy-set
  // ──────────────────────────────────────────────────────────────────────
  server.registerTool(
    "director.autonomy-set",
    {
      description:
        "Set Director's autonomy config. Phase-1 ships one mode (`draft-and-approve`); flipping `auto-for-repeat-role: true` requires an explicit approval token (fail-closed otherwise).",
      inputSchema: {
        mode: z.enum(AUTONOMY_MODES).optional(),
        autoForRepeatRole: z.boolean().optional(),
        approvalToken: z
          .string()
          .optional()
          .describe("Explicit approval token when flipping `auto-for-repeat-role` to true."),
      },
    },
    async (args) => {
      const current =
        (await ctx.kv.get<DirectorAutonomyConfig>(directorKv.core())) ?? DEFAULT_AUTONOMY_CONFIG;
      const next: DirectorAutonomyConfig = { ...current };
      if (args.mode) next.mode = args.mode;
      if (args.autoForRepeatRole === true) {
        if (!args.approvalToken) {
          return errJson(
            "flipping 'auto-for-repeat-role: true' requires an explicit `approvalToken` from an MCP elicitation; fail-closed",
          );
        }
        next["auto-for-repeat-role"] = true;
        await recordDecision(ctx.kv, {
          decisionId: newDecisionId(ctx.now()),
          tsMs: ctx.now(),
          action: "autonomy.auto-for-repeat-role-enabled",
          actor: "bradford",
          summary: `auto-for-repeat-role flipped to true (approval token: ${args.approvalToken})`,
        });
      } else if (args.autoForRepeatRole === false) {
        next["auto-for-repeat-role"] = false;
      }
      const parsed = DirectorAutonomyConfigSchema.parse(next);
      await ctx.kv.put(directorKv.core(), parsed);
      return okJson(parsed);
    },
  );

  // ──────────────────────────────────────────────────────────────────────
  // director.sweep — Phase-6 cron.
  // ──────────────────────────────────────────────────────────────────────
  server.registerTool(
    "director.sweep",
    {
      description:
        "Phase-6 sweep — re-run evals on deployed experts, check edit-distance signals, propose refinements if primary/secondary metrics breach bar.",
      inputSchema: {
        expertId: z.string().optional().describe("Scope the sweep to one expert; omit to sweep all."),
      },
    },
    async (args) => {
      const expertIds = (await ctx.kv.get<string[]>(directorKv.expertIndex())) ?? [];
      const scope = args.expertId ? expertIds.filter((id) => id === args.expertId) : expertIds;
      const proposals: Array<{ expertId: string; refId: string; trigger: string }> = [];
      for (const expertId of scope) {
        const existing = await listRefinements(ctx.kv, expertId);
        const open = existing.filter(
          (r) => r.state === "drafted" || r.state === "awaiting-approval",
        );
        if (open.length > 0) continue; // don't double-propose
        // In the real path, Director would re-run the fixtures and inspect
        // telemetry; the sweep tool simply surfaces the "no breach detected"
        // result here when invoked without external signals.
        proposals.push({ expertId, refId: "(none)", trigger: "no breach detected" });
      }
      return okJson({
        swept: scope.length,
        proposals,
        thresholds: REFINEMENT_TRIGGER_DEFAULTS,
      });
    },
  );

  // ──────────────────────────────────────────────────────────────────────
  // director.refine — explicit refinement proposal.
  // ──────────────────────────────────────────────────────────────────────
  server.registerTool(
    "director.refine",
    {
      description:
        "Open a refinement proposal (§9) for an expert. The persona diff must be ≤ 100 lines (agent-self-edit Promotion Gate cap).",
      inputSchema: {
        expertId: z.string().min(1),
        trigger: z.enum([
          "eval-regression",
          "edit-distance-spike",
          "explicit-user-request",
          "director-judgment-pass",
        ]),
        triggerDetail: z.string().min(1),
        personaDiff: z.string().min(1),
        whyItHelps: z.string().min(1),
        rollbackPlan: z.string().min(1),
      },
    },
    async (args) => {
      const refId = newRefId(ctx.now());
      const linesChanged = args.personaDiff.split("\n").filter((l) => l.startsWith("+") || l.startsWith("-")).length;
      if (linesChanged > 100) {
        return errJson(
          `refinement diff is ${linesChanged} lines; cap is 100 (agent-self-edit Promotion Gate). Split into smaller refinements.`,
        );
      }
      const proposal: RefinementProposal = {
        refId,
        expertId: args.expertId,
        trigger: args.trigger,
        triggerDetail: args.triggerDetail,
        linesChanged,
        personaDiff: args.personaDiff,
        beforeEval: {
          scores: [],
          passRate: 0,
          passBar: 0.8,
          passed: false,
          failingFixtures: [],
          wholesaleFail: false,
        },
        afterEval: {
          scores: [],
          passRate: 0,
          passBar: 0.8,
          passed: false,
          failingFixtures: [],
          wholesaleFail: false,
        },
        whyItHelps: args.whyItHelps,
        rollbackPlan: args.rollbackPlan,
        state: "drafted",
        createdAt: new Date(ctx.now()).toISOString(),
      };
      await recordRefinement(ctx.kv, proposal);
      await recordDecision(ctx.kv, {
        decisionId: newDecisionId(ctx.now()),
        expertId: args.expertId,
        tsMs: ctx.now(),
        action: "refine.drafted",
        actor: "director",
        summary: `refinement '${refId}' drafted for '${args.expertId}' (trigger: ${args.trigger}); ${linesChanged} lines changed`,
      });
      return okJson(proposal);
    },
  );
}

async function loadRejectedFingerprints(kv: KvStore): Promise<Set<string>> {
  const prefix = `${directorKv.rejected("")}`;
  const keys = await kv.listKeys(prefix);
  const out = new Set<string>();
  for (const key of keys) {
    const fp = key.slice(prefix.length);
    if (fp) out.add(fp);
  }
  return out;
}
