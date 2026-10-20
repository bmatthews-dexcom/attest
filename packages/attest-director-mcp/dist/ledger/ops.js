import { directorKv } from "../kv/namespace.js";
import {
  kvListAppend,
  kvListRemoveWhere
} from "../kv/store.js";
async function recordBrief(kv, brief) {
  await kv.put(directorKv.roleBrief(brief.id), brief);
  await kvListAppend(kv, directorKv.roleBriefIndex(), brief.id, { dedupe: true });
}
async function updateBriefState(kv, briefId, state, patch) {
  const current = await kv.get(directorKv.roleBrief(briefId));
  if (!current) return void 0;
  const next = {
    ...current,
    ...patch ?? {},
    state,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  await kv.put(directorKv.roleBrief(briefId), next);
  return next;
}
async function listBriefs(kv) {
  const ids = await kv.get(directorKv.roleBriefIndex()) ?? [];
  const out = [];
  for (const id of ids) {
    const b = await kv.get(directorKv.roleBrief(id));
    if (b) out.push(b);
  }
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
}
async function recordDraft(kv, briefId, version, draft) {
  await kv.put(directorKv.draft(briefId, version), draft);
}
async function recordDraftEval(kv, briefId, version, report) {
  await kv.put(directorKv.draftEval(briefId, version), report);
}
async function recordExpert(kv, expert) {
  await kv.put(directorKv.expert(expert.expertId), expert);
  await kvListAppend(kv, directorKv.expertIndex(), expert.expertId, { dedupe: true });
  const summary = {
    expertId: expert.expertId,
    briefId: expert.briefId,
    scope: expert.scope,
    state: expert.state,
    formFactor: expert.formFactor,
    capabilities: expert.capabilities,
    evalPassRate: expert.evalPassRate,
    deployedAt: expert.deployedAt
  };
  await kv.put(directorKv.expertSummaryResource(expert.expertId), summary);
}
async function updateExpertScope(kv, expertId, scope) {
  const current = await kv.get(directorKv.expert(expertId));
  if (!current) return void 0;
  const next = {
    ...current,
    scope,
    ...scope === "shared" ? {} : { demotedAt: (/* @__PURE__ */ new Date()).toISOString() }
  };
  await recordExpert(kv, next);
  return next;
}
async function retireExpert(kv, expertId, reason) {
  const current = await kv.get(directorKv.expert(expertId));
  if (!current) return void 0;
  const next = {
    ...current,
    state: "retired",
    retiredAt: (/* @__PURE__ */ new Date()).toISOString(),
    deployLog: [
      ...current.deployLog,
      {
        tsMs: Date.now(),
        phase: "rollback",
        ok: true,
        summary: `retired: ${reason}`
      }
    ]
  };
  await recordExpert(kv, next);
  await kv.put(directorKv.retired(expertId), {
    expertId,
    reason,
    retiredAt: next.retiredAt
  });
  return next;
}
async function recordCompletionResource(kv, briefId, resource) {
  await kv.put(directorKv.completionResource(briefId), resource);
}
async function recordRefinement(kv, proposal) {
  await kv.put(directorKv.refinement(proposal.expertId, proposal.refId), proposal);
  await kvListAppend(kv, directorKv.refinementIndex(proposal.expertId), proposal.refId, {
    dedupe: true
  });
}
async function listRefinements(kv, expertId) {
  const ids = await kv.get(directorKv.refinementIndex(expertId)) ?? [];
  const out = [];
  for (const id of ids) {
    const r = await kv.get(directorKv.refinement(expertId, id));
    if (r) out.push(r);
  }
  return out;
}
async function recordDecision(kv, decision) {
  const key = directorKv.decision(decision.decisionId);
  await kv.put(key, decision);
}
async function listDecisions(kv, filter) {
  const keys = await kv.listKeys(directorKv.decision(""));
  const out = [];
  for (const key of keys) {
    const d = await kv.get(key);
    if (!d) continue;
    if (filter?.briefId && d.briefId !== filter.briefId) continue;
    if (filter?.expertId && d.expertId !== filter.expertId) continue;
    if (filter?.sinceMs && d.tsMs < filter.sinceMs) continue;
    out.push(d);
  }
  return out.sort((a, b) => a.tsMs - b.tsMs);
}
async function recordRejection(kv, fingerprint, payload) {
  await kv.put(directorKv.rejected(fingerprint), payload);
}
async function isRejectedFingerprint(kv, fingerprint) {
  return await kv.get(directorKv.rejected(fingerprint)) !== void 0;
}
async function removePendingApprovalFromIndex(kv, binding, approvalId) {
  await kvListRemoveWhere(
    kv,
    directorKv.approvalIndex(binding),
    (e) => e.approvalId === approvalId
  );
}
function newDecisionId(now = Date.now()) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `dec_${now.toString(36)}_${rand}`;
}
function newExpertIdForBrief(brief) {
  return brief.role;
}
export {
  isRejectedFingerprint,
  listBriefs,
  listDecisions,
  listRefinements,
  newDecisionId,
  newExpertIdForBrief,
  recordBrief,
  recordCompletionResource,
  recordDecision,
  recordDraft,
  recordDraftEval,
  recordExpert,
  recordRefinement,
  recordRejection,
  removePendingApprovalFromIndex,
  retireExpert,
  updateBriefState,
  updateExpertScope
};
//# sourceMappingURL=ops.js.map
