/**
 * ceo-mcp-stub-tools.ts — in-process stand-in for the
 * `@bpmforge/attest-ceo-mcp` MCP server.
 *
 * Mirrors the real server's tool surface so the CEO agent, its tests,
 * and its evals can run with zero external processes. In production the
 * stub is replaced by the stdio server via `mcp-connections/attest-ceo-mcp.ts`.
 *
 * Implementations call into the shared package source directly — same
 * `draftPlan`, `extractIntents`, `ingestDiscussion`, `buildDispatchBlueprint`,
 * `stubCreateExpert` the real server exposes. This keeps the stub trivially
 * correct (no shadow re-implementation to drift).
 */

import * as z from "zod/v4";
import {
  buildDispatchBlueprint,
  type DispatchBlueprint,
} from "@bpmforge/attest-ceo-mcp/dispatch";
import { ingestDiscussion, type IngestResult } from "@bpmforge/attest-ceo-mcp/discussions";
import { extractIntents, type ExtractResult } from "@bpmforge/attest-ceo-mcp/intent";
import {
  approvePlan,
  denyPlan,
  draftPlan,
  refinePlan,
} from "@bpmforge/attest-ceo-mcp/plan";
import {
  stubCreateExpert,
  type DirectorCreateExpertInput,
  type DirectorCreateExpertResult,
} from "@bpmforge/attest-ceo-mcp/director";
import type {
  AutonomyMode,
  Commitment,
  Intent,
  Plan,
} from "../schema.js";

export type CeoMcpStubTool = {
  description: string;
  inputSchema: z.ZodType;
  execute: (input: Record<string, unknown>) => Promise<unknown> | unknown;
};

export const attestCeoMcpStubTools: Record<string, CeoMcpStubTool> = {
  ingest_discussion: {
    description:
      "attest-ceo-mcp stub: ingest a discussion into a digest + heuristic intents.",
    inputSchema: z.object({
      source: z.object({
        channel: z.enum([
          "cursor-chat",
          "paste",
          "slack",
          "linear",
          "github",
          "notes",
          "email",
          "other",
        ]),
        hint: z.string().optional(),
        url: z.string().nullable().optional(),
        referenceTime: z.string().nullable().optional(),
      }),
      text: z.string().min(1),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }),
    execute(input): IngestResult {
      const args = input as {
        source: Parameters<typeof ingestDiscussion>[0]["source"];
        text: string;
        metadata?: Record<string, unknown>;
      };
      return ingestDiscussion(args);
    },
  },
  extract_intent: {
    description: "attest-ceo-mcp stub: heuristic intent extraction.",
    inputSchema: z.object({
      text: z.string().min(1),
      minConfidence: z.number().min(0).max(1).optional(),
    }),
    execute(input): ExtractResult {
      const args = input as { text: string; minConfidence?: number };
      return extractIntents(args);
    },
  },
  draft_plan: {
    description: "attest-ceo-mcp stub: produce an awaiting-approval plan.",
    inputSchema: z.object({
      intent: z.any(),
      context: z
        .object({
          commitments: z.array(z.any()).optional(),
          scopeHint: z.string().optional(),
          phaseHint: z.string().optional(),
        })
        .optional(),
      dispatchMode: z.enum(["concurrent", "sequenced"]).optional(),
    }),
    execute(input): Plan {
      const args = input as {
        intent: Intent;
        context?: { commitments?: Commitment[]; scopeHint?: string; phaseHint?: string };
        dispatchMode?: "concurrent" | "sequenced";
      };
      return draftPlan(args) as unknown as Plan;
    },
  },
  approve_plan: {
    description: "attest-ceo-mcp stub: flip plan to approved.",
    inputSchema: z.object({ plan: z.any() }),
    execute(input): Plan {
      return approvePlan((input as { plan: Plan }).plan) as unknown as Plan;
    },
  },
  deny_plan: {
    description: "attest-ceo-mcp stub: flip plan to denied.",
    inputSchema: z.object({ plan: z.any() }),
    execute(input): Plan {
      return denyPlan((input as { plan: Plan }).plan) as unknown as Plan;
    },
  },
  refine_plan: {
    description: "attest-ceo-mcp stub: produce a v+1 plan version.",
    inputSchema: z.object({
      plan: z.any(),
      title: z.string().min(1),
      rationale: z.string().min(1),
    }),
    execute(input): Plan {
      const args = input as { plan: Plan; title: string; rationale: string };
      return refinePlan(args.plan, args.title, args.rationale) as unknown as Plan;
    },
  },
  dispatch_plan: {
    description: "attest-ceo-mcp stub: build a dispatch blueprint.",
    inputSchema: z.object({
      plan: z.any(),
      autonomyMode: z.enum([
        "watch",
        "nudge",
        "draft-only",
        "draft-and-approve",
        "auto-dispatch",
      ]),
      conductorTool: z.string().optional(),
    }),
    execute(input): DispatchBlueprint {
      const args = input as {
        plan: Plan;
        autonomyMode: AutonomyMode;
        conductorTool?: string;
      };
      return buildDispatchBlueprint(args as never);
    },
  },
  director_create_expert: {
    description:
      "attest-ceo-mcp stub: feature-flagged Director handoff (stub by default).",
    inputSchema: z.object({
      role: z.string().min(1),
      example_task: z.string().min(1),
      inputs: z.array(z.string()),
      outputs: z.array(z.string()),
      urgency: z.enum(["low", "medium", "high"]),
    }),
    execute(input): DirectorCreateExpertResult {
      return stubCreateExpert(input as DirectorCreateExpertInput);
    },
  },
  roadmap_sync: {
    description: "attest-ceo-mcp stub: no-op in stub mode (agent owns kv).",
    inputSchema: z.object({ ledger: z.any() }),
    execute() {
      return {
        ok: true,
        stubbed: true,
        note: "ledger is agent-owned under ceo:ledger:current; stub does not mirror.",
      };
    },
  },
  autonomy_set: {
    description: "attest-ceo-mcp stub: no-op in stub mode (agent owns kv).",
    inputSchema: z.object({
      mode: z.enum([
        "watch",
        "nudge",
        "draft-only",
        "draft-and-approve",
        "auto-dispatch",
      ]),
    }),
    execute() {
      return { ok: true, stubbed: true };
    },
  },
};
