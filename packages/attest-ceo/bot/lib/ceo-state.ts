/**
 * ceo-state.ts — kv helpers for the CEO ledger.
 *
 * The ledger is a single JSON blob under `ceo:ledger:current`. We also
 * mirror a few derived subsets under their own keys for cheap reads:
 *   - `ceo:roadmap:current`     (just `ledger.roadmap`)
 *   - `ceo:commitments:open`    (filter of `ledger.commitments`)
 *   - `ceo:plans:awaiting`      (filter of `ledger.plans`)
 *
 * Mutations always update the full ledger first, then re-publish the
 * mirrors. Reads prefer the primary key; the mirrors are a convenience.
 *
 * All functions are tiny and total — Phase 1 keeps the ledger in-memory
 * via `ctx.host.kv`, no SQL, no schema migrations. On Cursor hosting a
 * later turn may run in a new process; the kv value is the only
 * durable state (framework-map invariant 7).
 */

import {
  emptyLedger,
  ceoLedgerSchema,
  type AutonomyMode,
  type CeoLedger,
  type Commitment,
  type Decision,
  type DiscussionDigest,
  type Initiative,
  type Plan,
  type TaskRef,
} from "../schema.js";

export const LEDGER_KEY = "ceo:ledger:current";
export const ROADMAP_MIRROR_KEY = "ceo:roadmap:current";
export const OPEN_COMMITMENTS_MIRROR_KEY = "ceo:commitments:open";
export const AWAITING_PLANS_MIRROR_KEY = "ceo:plans:awaiting";

export type Kv = {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete?(key: string): Promise<void>;
};

/** Read the ledger, initializing it if the key is empty. */
export async function readLedger(kv: Kv): Promise<CeoLedger> {
  const raw = await kv.get(LEDGER_KEY);
  if (!raw) {
    const fresh = emptyLedger();
    await kv.put(LEDGER_KEY, fresh);
    return fresh;
  }
  const parsed = ceoLedgerSchema.safeParse(raw);
  if (!parsed.success) {
    // Treat an unparseable ledger as a hard reset so tests + first-run
    // smoke stay simple. In production we'd flag this via a decision log
    // entry; for now the ledger is a Phase 1 artifact and a parse
    // failure means a schema evolution happened between runs.
    const fresh = emptyLedger();
    await kv.put(LEDGER_KEY, fresh);
    return fresh;
  }
  return parsed.data;
}

/** Overwrite the ledger and republish mirrors. */
export async function writeLedger(kv: Kv, ledger: CeoLedger): Promise<CeoLedger> {
  const next: CeoLedger = { ...ledger, updatedAt: new Date().toISOString() };
  await kv.put(LEDGER_KEY, next);
  await publishMirrors(kv, next);
  return next;
}

/** Read-modify-write helper; wraps the common pattern cleanly. */
export async function mutateLedger(
  kv: Kv,
  mutator: (current: CeoLedger) => CeoLedger,
): Promise<CeoLedger> {
  const current = await readLedger(kv);
  const next = mutator(current);
  return writeLedger(kv, next);
}

async function publishMirrors(kv: Kv, ledger: CeoLedger): Promise<void> {
  await kv.put(ROADMAP_MIRROR_KEY, ledger.roadmap);
  await kv.put(
    OPEN_COMMITMENTS_MIRROR_KEY,
    ledger.commitments.filter(
      (c) => c.state === "open" || c.state === "in-flight",
    ),
  );
  await kv.put(
    AWAITING_PLANS_MIRROR_KEY,
    ledger.plans.filter((p) => p.approvalState === "awaiting-approval"),
  );
}

export function upsertCommitment(
  ledger: CeoLedger,
  commitment: Commitment,
): CeoLedger {
  const next = ledger.commitments.filter((c) => c.id !== commitment.id);
  next.push(commitment);
  return { ...ledger, commitments: next };
}

export function upsertInitiative(
  ledger: CeoLedger,
  initiative: Initiative,
): CeoLedger {
  const next = ledger.roadmap.filter((i) => i.id !== initiative.id);
  next.push(initiative);
  return { ...ledger, roadmap: next };
}

export function upsertPlan(ledger: CeoLedger, plan: Plan): CeoLedger {
  const next = ledger.plans.filter(
    (p) => !(p.id === plan.id && p.version === plan.version),
  );
  next.push(plan);
  return { ...ledger, plans: next };
}

export function appendDecision(
  ledger: CeoLedger,
  decision: Decision,
): CeoLedger {
  return { ...ledger, decisions: [...ledger.decisions, decision] };
}

export function appendDiscussion(
  ledger: CeoLedger,
  digest: DiscussionDigest,
): CeoLedger {
  return { ...ledger, discussions: [...ledger.discussions, digest] };
}

export function upsertTaskRef(ledger: CeoLedger, ref: TaskRef): CeoLedger {
  const next = ledger.tasks.filter((t) => t.chiefTaskId !== ref.chiefTaskId);
  next.push(ref);
  return { ...ledger, tasks: next };
}

export function setAutonomy(
  ledger: CeoLedger,
  mode: AutonomyMode,
): CeoLedger {
  return { ...ledger, autonomy: mode };
}

/**
 * Find a plan by id — returns the HIGHEST version. `/ceo approve <id>`
 * targets the latest version by default; a caller that wants a
 * specific version can filter manually.
 */
export function findPlan(ledger: CeoLedger, planId: string): Plan | undefined {
  const versions = ledger.plans
    .filter((p) => p.id === planId)
    .sort((a, b) => b.version - a.version);
  return versions[0];
}

/**
 * Dedup check for a new intent against open commitments. Phase 1 uses
 * exact-fingerprint match only — semantic recall lands in Phase 2.
 * Returns the matching commitment or `undefined`.
 */
export function findDuplicateCommitment(
  ledger: CeoLedger,
  fingerprint: string,
): Commitment | undefined {
  return ledger.commitments.find(
    (c) =>
      c.dedupeFingerprint === fingerprint &&
      (c.state === "open" || c.state === "in-flight"),
  );
}
