/**
 * Ledger operations — all the kv writes Director's phases need, grouped
 * by Phase so the §4 lifecycle stays readable in code.
 */
import type { KvStore } from "../kv/store.js";
import { directorKv } from "../kv/namespace.js";
import {
  kvListAppend,
  kvListRemoveWhere,
} from "../kv/store.js";
import type {
  RoleBrief,
  RoleBriefState,
} from "../schema/role-brief.js";
import type {
  DraftArtifactIndex,
  EvalReport,
} from "../schema/draft.js";
import type {
  CompletionResource,
  ExpertRecord,
  ExpertScope,
  ExpertSummaryResource,
} from "../schema/expert.js";
import type { RefinementProposal } from "../schema/refinement.js";

export interface AuditDecision {
  decisionId: string;
  briefId?: string;
  expertId?: string;
  tsMs: number;
  action: string;
  actor: "director" | "ceo" | "bradford" | "cron";
  summary: string;
  payload?: Record<string, unknown>;
}

export async function recordBrief(kv: KvStore, brief: RoleBrief): Promise<void> {
  await kv.put(directorKv.roleBrief(brief.id), brief);
  await kvListAppend(kv, directorKv.roleBriefIndex(), brief.id, { dedupe: true });
}

export async function updateBriefState(
  kv: KvStore,
  briefId: string,
  state: RoleBriefState,
  patch?: Partial<RoleBrief>,
): Promise<RoleBrief | undefined> {
  const current = await kv.get<RoleBrief>(directorKv.roleBrief(briefId));
  if (!current) return undefined;
  const next: RoleBrief = {
    ...current,
    ...(patch ?? {}),
    state,
    updated_at: new Date().toISOString(),
  };
  await kv.put(directorKv.roleBrief(briefId), next);
  return next;
}

export async function listBriefs(kv: KvStore): Promise<RoleBrief[]> {
  const ids = (await kv.get<string[]>(directorKv.roleBriefIndex())) ?? [];
  const out: RoleBrief[] = [];
  for (const id of ids) {
    const b = await kv.get<RoleBrief>(directorKv.roleBrief(id));
    if (b) out.push(b);
  }
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function recordDraft(
  kv: KvStore,
  briefId: string,
  version: number,
  draft: DraftArtifactIndex,
): Promise<void> {
  await kv.put(directorKv.draft(briefId, version), draft);
}

export async function recordDraftEval(
  kv: KvStore,
  briefId: string,
  version: number,
  report: EvalReport,
): Promise<void> {
  await kv.put(directorKv.draftEval(briefId, version), report);
}

export async function recordExpert(kv: KvStore, expert: ExpertRecord): Promise<void> {
  await kv.put(directorKv.expert(expert.expertId), expert);
  await kvListAppend(kv, directorKv.expertIndex(), expert.expertId, { dedupe: true });
  const summary: ExpertSummaryResource = {
    expertId: expert.expertId,
    briefId: expert.briefId,
    scope: expert.scope,
    state: expert.state,
    formFactor: expert.formFactor,
    capabilities: expert.capabilities,
    evalPassRate: expert.evalPassRate,
    deployedAt: expert.deployedAt,
  };
  await kv.put(directorKv.expertSummaryResource(expert.expertId), summary);
}

export async function updateExpertScope(
  kv: KvStore,
  expertId: string,
  scope: ExpertScope,
): Promise<ExpertRecord | undefined> {
  const current = await kv.get<ExpertRecord>(directorKv.expert(expertId));
  if (!current) return undefined;
  const next: ExpertRecord = {
    ...current,
    scope,
    ...(scope === "shared" ? {} : { demotedAt: new Date().toISOString() }),
  };
  await recordExpert(kv, next);
  return next;
}

export async function retireExpert(
  kv: KvStore,
  expertId: string,
  reason: string,
): Promise<ExpertRecord | undefined> {
  const current = await kv.get<ExpertRecord>(directorKv.expert(expertId));
  if (!current) return undefined;
  const next: ExpertRecord = {
    ...current,
    state: "retired",
    retiredAt: new Date().toISOString(),
    deployLog: [
      ...current.deployLog,
      {
        tsMs: Date.now(),
        phase: "rollback",
        ok: true,
        summary: `retired: ${reason}`,
      },
    ],
  };
  await recordExpert(kv, next);
  await kv.put(directorKv.retired(expertId), {
    expertId,
    reason,
    retiredAt: next.retiredAt,
  });
  return next;
}

export async function recordCompletionResource(
  kv: KvStore,
  briefId: string,
  resource: CompletionResource,
): Promise<void> {
  await kv.put(directorKv.completionResource(briefId), resource);
}

export async function recordRefinement(
  kv: KvStore,
  proposal: RefinementProposal,
): Promise<void> {
  await kv.put(directorKv.refinement(proposal.expertId, proposal.refId), proposal);
  await kvListAppend(kv, directorKv.refinementIndex(proposal.expertId), proposal.refId, {
    dedupe: true,
  });
}

export async function listRefinements(
  kv: KvStore,
  expertId: string,
): Promise<RefinementProposal[]> {
  const ids = (await kv.get<string[]>(directorKv.refinementIndex(expertId))) ?? [];
  const out: RefinementProposal[] = [];
  for (const id of ids) {
    const r = await kv.get<RefinementProposal>(directorKv.refinement(expertId, id));
    if (r) out.push(r);
  }
  return out;
}

export async function recordDecision(
  kv: KvStore,
  decision: AuditDecision,
): Promise<void> {
  const key = directorKv.decision(decision.decisionId);
  await kv.put(key, decision);
}

export async function listDecisions(
  kv: KvStore,
  filter?: { briefId?: string; expertId?: string; sinceMs?: number },
): Promise<AuditDecision[]> {
  const keys = await kv.listKeys(directorKv.decision(""));
  const out: AuditDecision[] = [];
  for (const key of keys) {
    const d = await kv.get<AuditDecision>(key);
    if (!d) continue;
    if (filter?.briefId && d.briefId !== filter.briefId) continue;
    if (filter?.expertId && d.expertId !== filter.expertId) continue;
    if (filter?.sinceMs && d.tsMs < filter.sinceMs) continue;
    out.push(d);
  }
  return out.sort((a, b) => a.tsMs - b.tsMs);
}

export async function recordRejection(
  kv: KvStore,
  fingerprint: string,
  payload: { reason: string; briefId: string; rejectedAt: string },
): Promise<void> {
  await kv.put(directorKv.rejected(fingerprint), payload);
}

export async function isRejectedFingerprint(
  kv: KvStore,
  fingerprint: string,
): Promise<boolean> {
  return (await kv.get(directorKv.rejected(fingerprint))) !== undefined;
}

export async function removePendingApprovalFromIndex(
  kv: KvStore,
  binding: { owner: string; repo: string; issueNumber: number },
  approvalId: string,
): Promise<void> {
  await kvListRemoveWhere(
    kv,
    directorKv.approvalIndex(binding),
    (e: { approvalId?: string }) => e.approvalId === approvalId,
  );
}

export function newDecisionId(now: number = Date.now()): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `dec_${now.toString(36)}_${rand}`;
}

export function newExpertIdForBrief(brief: Pick<RoleBrief, "role">): string {
  return brief.role;
}
