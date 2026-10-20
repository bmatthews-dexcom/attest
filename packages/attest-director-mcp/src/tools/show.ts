/**
 * `director.show`, `director.audit`, `director.rate` — read-mostly tools.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { DirectorServerContext } from "../server.js";
import { okJson } from "./_shared.js";
import { directorKv } from "../kv/namespace.js";
import { listDecisions, newDecisionId, recordDecision } from "../ledger/ops.js";
import type { ExpertRecord } from "../schema/expert.js";
import type { RoleBrief } from "../schema/role-brief.js";
import type { RefinementProposal } from "../schema/refinement.js";

export function registerShowTools(
  server: McpServer,
  ctx: DirectorServerContext,
): void {
  server.registerTool(
    "director.show",
    {
      description:
        "Show a specific brief / expert / refinement / core-config by id. Returns `{ kind, record }` or `{ kind, missing: true }`.",
      inputSchema: {
        kind: z.enum(["brief", "expert", "refinement", "core"]),
        id: z.string().optional(),
        expertId: z.string().optional(),
      },
    },
    async (args) => {
      switch (args.kind) {
        case "core": {
          const core = await ctx.kv.get(directorKv.core());
          return okJson({ kind: "core", record: core });
        }
        case "brief": {
          if (!args.id) return okJson({ kind: "brief", missing: true, reason: "missing id" });
          const b = await ctx.kv.get<RoleBrief>(directorKv.roleBrief(args.id));
          return okJson({ kind: "brief", record: b ?? null, missing: !b });
        }
        case "expert": {
          if (!args.id) return okJson({ kind: "expert", missing: true, reason: "missing id" });
          const e = await ctx.kv.get<ExpertRecord>(directorKv.expert(args.id));
          return okJson({ kind: "expert", record: e ?? null, missing: !e });
        }
        case "refinement": {
          if (!args.id || !args.expertId) {
            return okJson({ kind: "refinement", missing: true, reason: "missing id or expertId" });
          }
          const r = await ctx.kv.get<RefinementProposal>(
            directorKv.refinement(args.expertId, args.id),
          );
          return okJson({ kind: "refinement", record: r ?? null, missing: !r });
        }
      }
    },
  );

  server.registerTool(
    "director.audit",
    {
      description:
        "Query the decision log. Filters: `briefId`, `expertId`, `sinceMs`. Returns the matching entries in timestamp order.",
      inputSchema: {
        briefId: z.string().optional(),
        expertId: z.string().optional(),
        sinceMs: z.number().int().nonnegative().optional(),
      },
    },
    async (args) => {
      const decisions = await listDecisions(ctx.kv, args);
      return okJson({ count: decisions.length, decisions });
    },
  );

  server.registerTool(
    "director.rate",
    {
      description:
        "Record an explicit good/bad rating on a live expert. Secondary signal — primary is eval regression, secondary is edit distance.",
      inputSchema: {
        expertId: z.string().min(1),
        rating: z.enum(["good", "bad"]),
        note: z.string().optional(),
      },
    },
    async (args) => {
      const expert = await ctx.kv.get<ExpertRecord>(directorKv.expert(args.expertId));
      if (!expert) return okJson({ ok: false, reason: `expert '${args.expertId}' not found` });
      const now = ctx.now();
      const nextTelemetry = expert.telemetry.length === 0
        ? [{ tsMs: now, invocations: 0, evalPassRate: expert.evalPassRate, editDistanceP50: 0, explicitRatings: { good: 0, bad: 0 } }]
        : [...expert.telemetry];
      const last = nextTelemetry.at(-1)!;
      const updated = {
        ...last,
        tsMs: now,
        explicitRatings: {
          good: last.explicitRatings.good + (args.rating === "good" ? 1 : 0),
          bad: last.explicitRatings.bad + (args.rating === "bad" ? 1 : 0),
        },
      };
      nextTelemetry[nextTelemetry.length - 1] = updated;
      const nextExpert: ExpertRecord = { ...expert, telemetry: nextTelemetry };
      await ctx.kv.put(directorKv.expert(expert.expertId), nextExpert);
      await recordDecision(ctx.kv, {
        decisionId: newDecisionId(now),
        expertId: expert.expertId,
        tsMs: now,
        action: `rate.${args.rating}`,
        actor: "bradford",
        summary: args.note ?? `rated '${args.rating}'`,
      });
      return okJson({ ok: true, telemetry: updated });
    },
  );
}
