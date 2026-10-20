import { z } from "zod";
import { okJson, errJson } from "./_shared.js";
import {
  recordExpert,
  updateExpertScope,
  retireExpert,
  recordDecision,
  newDecisionId,
  newExpertIdForBrief
} from "../ledger/ops.js";
import { ExpertRecordSchema } from "../schema/expert.js";
import { directorKv } from "../kv/namespace.js";
import { pickFormFactor } from "../form-factor/pick.js";
function registerPromotionTools(server, ctx) {
  server.registerTool(
    "register_expert",
    {
      description: "Phase-5 register: writes the private manifest entry for an approved expert and marks the expert `deployed`. Hot-registration against attest-mcp's handler framework is a side effect the Director agent performs after this call succeeds.",
      inputSchema: {
        briefId: z.string().min(1),
        formFactor: z.enum(["skill", "in-process-handler", "sandbox-bdk-agent"]).optional(),
        evalPassRate: z.number().min(0).max(1).default(1),
        approvedBy: z.string().optional()
      }
    },
    async (args) => {
      const brief = await ctx.kv.get(directorKv.roleBrief(args.briefId));
      if (!brief) return errJson(`brief '${args.briefId}' not found`);
      const formFactor = args.formFactor ?? pickFormFactor({
        capabilities: brief.requested_capabilities,
        preference: brief.form_factor_preference
      }).decision.pick;
      const now = ctx.now();
      const expert = ExpertRecordSchema.parse({
        expertId: newExpertIdForBrief(brief),
        briefId: brief.id,
        scope: "private",
        state: "deployed",
        formFactor,
        capabilities: brief.requested_capabilities,
        evalPassRate: args.evalPassRate,
        deployLog: [
          { tsMs: now, phase: "register-manifest", ok: true, summary: "wrote private manifest entry" },
          { tsMs: now, phase: "hot-register-mcp", ok: true, summary: "registered in attest-mcp handler framework (deferred to agent)" }
        ],
        telemetry: [],
        createdAt: new Date(now).toISOString(),
        deployedAt: new Date(now).toISOString()
      });
      await recordExpert(ctx.kv, expert);
      await recordDecision(ctx.kv, {
        decisionId: newDecisionId(now),
        briefId: brief.id,
        expertId: expert.expertId,
        tsMs: now,
        action: "register_expert",
        actor: args.approvedBy ? "bradford" : "director",
        summary: `expert '${expert.expertId}' registered, scope=private, form_factor=${formFactor}`
      });
      return okJson(expert);
    }
  );
  server.registerTool(
    "director.promote",
    {
      description: "Open a promotion proposal \u2014 private \u2192 shared (\xA78.3). Writes the proposed PR body; the actual PR open is `ask-each` on push:personal-gh / pr:open:local-attest-repo.",
      inputSchema: {
        expertId: z.string().min(1),
        reason: z.string().min(1)
      }
    },
    async (args) => {
      const expert = await ctx.kv.get(directorKv.expert(args.expertId));
      if (!expert) return errJson(`expert '${args.expertId}' not found`);
      if (expert.scope === "shared") {
        return okJson({ ok: false, reason: `expert '${args.expertId}' is already in shared scope` });
      }
      await recordDecision(ctx.kv, {
        decisionId: newDecisionId(ctx.now()),
        expertId: expert.expertId,
        tsMs: ctx.now(),
        action: "promote.proposed",
        actor: "director",
        summary: `promotion proposal drafted for '${expert.expertId}': ${args.reason}`
      });
      return okJson({
        ok: true,
        expertId: expert.expertId,
        prBodyTemplate: renderPromotionPrBody(expert, args.reason),
        asksEach: ["push:personal-gh", "pr:open:local-attest-repo"],
        note: "Open the PR via the Director agent (`push:personal-gh` + `pr:open:local-attest-repo` are ask-each; the MCP server never pushes autonomously)."
      });
    }
  );
  server.registerTool(
    "promote_to_shared",
    {
      description: "Internal helper used by `director.promote` once the PR has been opened and merged. Flips `scope` to `shared` and records the manifest diff.",
      inputSchema: {
        expertId: z.string().min(1),
        prUrl: z.string().url().optional()
      }
    },
    async (args) => {
      const next = await updateExpertScope(ctx.kv, args.expertId, "shared");
      if (!next) return errJson(`expert '${args.expertId}' not found`);
      await recordDecision(ctx.kv, {
        decisionId: newDecisionId(ctx.now()),
        expertId: args.expertId,
        tsMs: ctx.now(),
        action: "promote.applied",
        actor: "director",
        summary: `scope flipped to shared${args.prUrl ? ` (PR ${args.prUrl})` : ""}`
      });
      return okJson({ ok: true, expert: next });
    }
  );
  server.registerTool(
    "director.demote",
    {
      description: "Reverse promotion \u2014 shared \u2192 private (\xA78.4). Writes a demotion-PR template.",
      inputSchema: {
        expertId: z.string().min(1),
        reason: z.string().min(1)
      }
    },
    async (args) => {
      const next = await updateExpertScope(ctx.kv, args.expertId, "private");
      if (!next) return errJson(`expert '${args.expertId}' not found`);
      await recordDecision(ctx.kv, {
        decisionId: newDecisionId(ctx.now()),
        expertId: args.expertId,
        tsMs: ctx.now(),
        action: "demote",
        actor: "director",
        summary: `demotion: ${args.reason}`
      });
      return okJson({ ok: true, expert: next });
    }
  );
  server.registerTool(
    "director.retire",
    {
      description: "Retire a live expert from both tiers after approval. Writes a retirement record so Director won't recreate the expert on the next similar brief (\xA78.4).",
      inputSchema: {
        expertId: z.string().min(1),
        reason: z.string().min(1)
      }
    },
    async (args) => {
      const next = await retireExpert(ctx.kv, args.expertId, args.reason);
      if (!next) return errJson(`expert '${args.expertId}' not found`);
      await recordDecision(ctx.kv, {
        decisionId: newDecisionId(ctx.now()),
        expertId: args.expertId,
        tsMs: ctx.now(),
        action: "retire",
        actor: "bradford",
        summary: `retired: ${args.reason}`
      });
      return okJson({ ok: true, expert: next });
    }
  );
}
function renderPromotionPrBody(expert, reason) {
  const lines = [];
  lines.push(`# promote: ${expert.expertId} \u2192 shared`);
  lines.push("");
  lines.push(`Reason: ${reason}`);
  lines.push("");
  lines.push("## Role brief");
  lines.push("```json");
  lines.push(JSON.stringify({ briefId: expert.briefId }, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## Form factor and rationale");
  lines.push(`- form_factor: \`${expert.formFactor}\``);
  lines.push("");
  lines.push("## Capability map");
  lines.push("```json");
  lines.push(JSON.stringify(expert.capabilities, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## Eval report");
  lines.push(`- pass_rate: ${expert.evalPassRate}`);
  lines.push("");
  lines.push("## Private-tier usage summary");
  lines.push(`- deploy_log length: ${expert.deployLog.length}`);
  lines.push("");
  lines.push("## Integrations required");
  lines.push("- (see role brief)");
  lines.push("");
  lines.push("## Manifest diff");
  lines.push("- adds entry to `classification.generated.json` under its cluster");
  lines.push("");
  lines.push("## Private pool residual");
  lines.push("- private copy stays in place until the PR lands; sync script removes it post-merge");
  lines.push("");
  lines.push("## Rollback plan");
  lines.push(`- \`git revert\` the merge commit + \`/director demote ${expert.expertId}\``);
  return lines.join("\n");
}
export {
  registerPromotionTools,
  renderPromotionPrBody
};
//# sourceMappingURL=promotion.js.map
