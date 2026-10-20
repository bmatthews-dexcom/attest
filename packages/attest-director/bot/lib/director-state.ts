/**
 * Director state model — the TypeScript shape the agent's own kv persists.
 *
 * Mirrors the MCP server's ledger exactly where they overlap (role brief,
 * expert record, refinement). The agent additionally tracks per-chat
 * context (active brief id, last command, last approval id).
 */
import * as z from "zod/v4";

export const DIRECTOR_KV = {
  core(): string {
    return "director:core";
  },
  roleBrief(id: string): string {
    return `director:role-briefs:${id}`;
  },
  roleBriefIndex(): string {
    return "director:index:role-briefs";
  },
  activeBrief(sessionId: string): string {
    return `director:active:${sessionId}`;
  },
  expert(id: string): string {
    return `director:experts:${id}`;
  },
  expertIndex(): string {
    return "director:index:experts";
  },
  refinement(expertId: string, refId: string): string {
    return `director:refinements:${expertId}:${refId}`;
  },
  decision(id: string): string {
    return `director:decisions:${id}`;
  },
  approval(id: string): string {
    return `director:approval:${id}`;
  },
  approvalIndex(bind: { owner: string; repo: string; issueNumber: number }): string {
    return `director:approval-index:${bind.owner}/${bind.repo}#${bind.issueNumber}`;
  },
} as const;

export const DirectorCoreSchema = z.object({
  mode: z.enum(["draft-and-approve"]).default("draft-and-approve"),
  "auto-for-repeat-role": z.boolean().default(false),
  updatedAt: z.string().min(1),
});
export type DirectorCore = z.infer<typeof DirectorCoreSchema>;

export const DEFAULT_DIRECTOR_CORE: DirectorCore = {
  mode: "draft-and-approve",
  "auto-for-repeat-role": false,
  updatedAt: new Date(0).toISOString(),
};

export function newBriefId(nowMs: number = Date.now()): string {
  const d = new Date(nowMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 6);
  return `rb-${y}${m}${day}-${rand}`;
}

export function newActionId(briefId: string, phase: string, intent: string): string {
  const slug = `${briefId}:${phase}:${intent}`.replace(/[^A-Za-z0-9:_-]/g, "-");
  return `${slug}-${Date.now().toString(36)}`;
}

/**
 * Shape of the TS-driven Ralph loop step. The TS loop composes these and
 * passes them to the agent as context on each iteration.
 */
export type DirectorPhase =
  | "intake"
  | "detect-gap"
  | "research"
  | "draft"
  | "eval"
  | "approve"
  | "deploy"
  | "monitor"
  | "refine"
  | "done";

export const DIRECTOR_PHASES: readonly DirectorPhase[] = [
  "intake",
  "detect-gap",
  "research",
  "draft",
  "eval",
  "approve",
  "deploy",
  "monitor",
  "refine",
  "done",
];
