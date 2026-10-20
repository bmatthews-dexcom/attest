import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getLedger,
  openCommitments,
  setLedger,
  updateLedger,
} from "../dist/ledger.js";
import { emptyLedger } from "../dist/types.js";

test("setLedger / getLedger round-trip and open-commitment filter", () => {
  const l = emptyLedger();
  l.commitments.push(
    {
      id: "cmt-1",
      text: "open thing",
      state: "open",
      source: { channel: "cursor-chat" },
      evidence: [],
      dedupeFingerprint: "a".repeat(32),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dependencyIds: [],
      chiefTaskIds: [],
    },
    {
      id: "cmt-2",
      text: "shipped thing",
      state: "shipped",
      source: { channel: "cursor-chat" },
      evidence: [],
      dedupeFingerprint: "b".repeat(32),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dependencyIds: [],
      chiefTaskIds: [],
    },
  );
  setLedger(l);
  const open = openCommitments();
  assert.equal(open.length, 1);
  assert.equal(open[0].id, "cmt-1");
  assert.equal(getLedger().commitments.length, 2);
});

test("updateLedger bumps updatedAt and applies the mutator", async () => {
  setLedger(emptyLedger());
  const before = getLedger().updatedAt;
  await new Promise((r) => setTimeout(r, 2));
  const updated = updateLedger((ledger) => ({ ...ledger, autonomy: "watch" }));
  assert.equal(updated.autonomy, "watch");
  assert.notEqual(updated.updatedAt, before);
});
