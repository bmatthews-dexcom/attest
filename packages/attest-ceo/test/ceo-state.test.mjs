import { test } from "node:test";
import assert from "node:assert/strict";

const {
  LEDGER_KEY,
  ROADMAP_MIRROR_KEY,
  OPEN_COMMITMENTS_MIRROR_KEY,
  AWAITING_PLANS_MIRROR_KEY,
  readLedger,
  writeLedger,
  mutateLedger,
  upsertCommitment,
  upsertInitiative,
  upsertPlan,
  appendDecision,
  appendDiscussion,
  upsertTaskRef,
  setAutonomy,
  findPlan,
  findDuplicateCommitment,
} = await import("../bot/lib/ceo-state.ts");

const { emptyLedger, DEFAULT_AUTONOMY } = await import("../bot/schema.ts");

/** Minimal in-memory kv for tests. */
function makeKv() {
  const store = new Map();
  return {
    async get(key) {
      return store.has(key) ? JSON.parse(JSON.stringify(store.get(key))) : undefined;
    },
    async put(key, value) {
      store.set(key, JSON.parse(JSON.stringify(value)));
    },
    async delete(key) {
      store.delete(key);
    },
    _store: store,
  };
}

test("kv namespace constants are stable + non-overlapping", () => {
  assert.equal(LEDGER_KEY, "ceo:ledger:current");
  assert.equal(ROADMAP_MIRROR_KEY, "ceo:roadmap:current");
  assert.equal(OPEN_COMMITMENTS_MIRROR_KEY, "ceo:commitments:open");
  assert.equal(AWAITING_PLANS_MIRROR_KEY, "ceo:plans:awaiting");
  const all = new Set([
    LEDGER_KEY,
    ROADMAP_MIRROR_KEY,
    OPEN_COMMITMENTS_MIRROR_KEY,
    AWAITING_PLANS_MIRROR_KEY,
  ]);
  assert.equal(all.size, 4);
});

test("readLedger seeds an empty ledger on first access", async () => {
  const kv = makeKv();
  const first = await readLedger(kv);
  assert.equal(first.version, 1);
  assert.equal(first.autonomy, DEFAULT_AUTONOMY);
  assert.deepEqual(first.roadmap, []);
  assert.deepEqual(first.commitments, []);
  assert.deepEqual(first.plans, []);
  assert.deepEqual(first.tasks, []);
  const second = await readLedger(kv);
  assert.equal(second.version, 1);
});

test("writeLedger updates updatedAt and publishes mirrors", async () => {
  const kv = makeKv();
  const base = emptyLedger("2020-01-01T00:00:00.000Z");
  await writeLedger(kv, base);
  const roadmapMirror = await kv.get(ROADMAP_MIRROR_KEY);
  assert.deepEqual(roadmapMirror, []);
  const openMirror = await kv.get(OPEN_COMMITMENTS_MIRROR_KEY);
  assert.deepEqual(openMirror, []);
  const awaitingMirror = await kv.get(AWAITING_PLANS_MIRROR_KEY);
  assert.deepEqual(awaitingMirror, []);
  const stored = await kv.get(LEDGER_KEY);
  assert.notEqual(stored.updatedAt, "2020-01-01T00:00:00.000Z");
});

test("mutateLedger is read-modify-write", async () => {
  const kv = makeKv();
  await mutateLedger(kv, (l) => setAutonomy(l, "watch"));
  const after = await readLedger(kv);
  assert.equal(after.autonomy, "watch");
});

test("upsertCommitment replaces by id", () => {
  const base = emptyLedger();
  const c1 = minimalCommitment("c1", "open");
  const c2 = minimalCommitment("c1", "shipped");
  const l1 = upsertCommitment(base, c1);
  assert.equal(l1.commitments.length, 1);
  const l2 = upsertCommitment(l1, c2);
  assert.equal(l2.commitments.length, 1);
  assert.equal(l2.commitments[0].state, "shipped");
});

test("upsertInitiative replaces by id", () => {
  const base = emptyLedger();
  const i1 = {
    id: "init-1",
    title: "login",
    rationale: "x",
    commitmentIds: [],
    state: "planned",
    priorityBand: "p1",
    createdAt: "2020",
    updatedAt: "2020",
  };
  const l1 = upsertInitiative(base, i1);
  const l2 = upsertInitiative(l1, { ...i1, state: "done" });
  assert.equal(l2.roadmap.length, 1);
  assert.equal(l2.roadmap[0].state, "done");
});

test("upsertPlan keys on (id, version)", () => {
  const base = emptyLedger();
  const v1 = minimalPlan("p1", 1);
  const v2 = minimalPlan("p1", 2);
  const l1 = upsertPlan(base, v1);
  const l2 = upsertPlan(l1, v2);
  assert.equal(l2.plans.length, 2);
  assert.deepEqual(
    l2.plans.map((p) => p.version).sort(),
    [1, 2],
  );
});

test("appendDecision + appendDiscussion are append-only", () => {
  const base = emptyLedger();
  const l1 = appendDecision(base, {
    id: "dec-1",
    what: "x",
    when: "2020",
    inputs: {},
    rationale: "r",
  });
  const l2 = appendDiscussion(l1, {
    id: "dis-1",
    source: { channel: "cursor-chat" },
    ingestedAt: "2020",
    textPreview: "hi",
    intentIds: [],
  });
  assert.equal(l2.decisions.length, 1);
  assert.equal(l2.discussions.length, 1);
});

test("upsertTaskRef replaces by chiefTaskId", () => {
  const base = emptyLedger();
  const l1 = upsertTaskRef(base, {
    chiefTaskId: "task_1",
    planId: "p1",
    stepId: "s1",
    dispatchedAt: "2020",
    lastSeenStatus: "running",
    completedAt: null,
  });
  const l2 = upsertTaskRef(l1, {
    chiefTaskId: "task_1",
    planId: "p1",
    stepId: "s1",
    dispatchedAt: "2020",
    lastSeenStatus: "done",
    completedAt: "2021",
  });
  assert.equal(l2.tasks.length, 1);
  assert.equal(l2.tasks[0].lastSeenStatus, "done");
});

test("findPlan returns the highest version", () => {
  const base = emptyLedger();
  const l1 = upsertPlan(base, minimalPlan("p1", 1));
  const l2 = upsertPlan(l1, minimalPlan("p1", 3));
  const l3 = upsertPlan(l2, minimalPlan("p1", 2));
  const latest = findPlan(l3, "p1");
  assert.equal(latest.version, 3);
});

test("findDuplicateCommitment matches on fingerprint + open state", () => {
  const base = emptyLedger();
  const c1 = { ...minimalCommitment("c1", "open"), dedupeFingerprint: "fp1" };
  const l1 = upsertCommitment(base, c1);
  const dup = findDuplicateCommitment(l1, "fp1");
  assert.equal(dup?.id, "c1");

  // closed commitment with same fingerprint should NOT match
  const closed = { ...c1, state: "shipped" };
  const l2 = upsertCommitment(l1, closed);
  assert.equal(findDuplicateCommitment(l2, "fp1"), undefined);
});

function minimalCommitment(id, state) {
  return {
    id,
    text: "x",
    state,
    source: { channel: "cursor-chat" },
    evidence: [],
    dedupeFingerprint: `fp-${id}`,
    createdAt: "2020",
    updatedAt: "2020",
    dependencyIds: [],
    chiefTaskIds: [],
  };
}

function minimalPlan(id, version) {
  return {
    id,
    version,
    title: `t${version}`,
    rationale: "r",
    commitmentIds: [],
    steps: [],
    approvalState: "awaiting-approval",
    estimatedChiefSessions: 1,
    riskNotes: "",
    createdAt: "2020",
    updatedAt: "2020",
  };
}
