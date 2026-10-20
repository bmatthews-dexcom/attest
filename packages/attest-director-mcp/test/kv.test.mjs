// KV store + namespace tests. See docs §11.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { directorKv, DIRECTOR_KV_NAMESPACE_PREFIX } from "../src/kv/namespace.ts";
import {
  FileKvStore,
  MemoryKvStore,
  keyToPath,
  kvListAppend,
  kvListRemoveWhere,
} from "../src/kv/store.ts";

test("directorKv keys all live under director: prefix", () => {
  for (const key of [
    directorKv.core(),
    directorKv.roleBrief("rb-x"),
    directorKv.roleBriefResearch("rb-x"),
    directorKv.draft("rb-x", 2),
    directorKv.expert("x-expert"),
    directorKv.decision("decision-1"),
    directorKv.rejected("fp-abc"),
    directorKv.approval("approval_1"),
    directorKv.approvalIndex({ owner: "o", repo: "r", issueNumber: 7 }),
    directorKv.roleBriefIndex(),
    directorKv.expertIndex(),
    directorKv.completionResource("rb-x"),
  ]) {
    assert.ok(key.startsWith(DIRECTOR_KV_NAMESPACE_PREFIX), `expected prefix on ${key}`);
  }
});

test("MemoryKvStore round-trips values + lists keys by prefix", async () => {
  const kv = new MemoryKvStore();
  await kv.put("director:a", { v: 1 });
  await kv.put("director:b", { v: 2 });
  await kv.put("other:z", { v: 3 });
  const got = await kv.get("director:a");
  assert.deepEqual(got, { v: 1 });
  const keys = await kv.listKeys("director:");
  assert.deepEqual(keys, ["director:a", "director:b"]);
  await kv.delete("director:a");
  assert.equal(await kv.get("director:a"), undefined);
});

test("FileKvStore round-trips values + lists keys by prefix", async () => {
  const root = await mkdtemp(join(tmpdir(), "director-kv-"));
  try {
    const kv = new FileKvStore(root);
    await kv.put("director:approval-index:owner/repo#12", [{ approvalId: "a1" }]);
    await kv.put("director:core", { mode: "draft-and-approve" });
    const core = await kv.get("director:core");
    assert.deepEqual(core, { mode: "draft-and-approve" });
    const keys = await kv.listKeys("director:");
    assert.ok(keys.includes("director:core"));
    assert.ok(keys.includes("director:approval-index:owner/repo#12"));
    await kv.delete("director:core");
    assert.equal(await kv.get("director:core"), undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("keyToPath encodes special characters so filesystem is safe", () => {
  const path = keyToPath("/tmp/x", "director:approval-index:owner/repo#12");
  // Must not contain raw "/" after the root or raw "#"
  const rel = path.slice("/tmp/x/".length);
  assert.ok(!rel.includes("/"), `rel path should not contain /, got ${rel}`);
  assert.ok(!rel.includes("#"), `rel path should not contain #, got ${rel}`);
});

test("kvListAppend creates, dedupes, and bounds the list", async () => {
  const kv = new MemoryKvStore();
  await kvListAppend(kv, "director:index:x", "a");
  await kvListAppend(kv, "director:index:x", "a", { dedupe: true });
  await kvListAppend(kv, "director:index:x", "b");
  await kvListAppend(kv, "director:index:x", "c", { max: 2 });
  const got = await kv.get("director:index:x");
  assert.deepEqual(got, ["b", "c"]);
});

test("kvListRemoveWhere drops matching items and clears empty lists", async () => {
  const kv = new MemoryKvStore();
  await kv.put("director:index:x", [{ id: "a" }, { id: "b" }, { id: "c" }]);
  await kvListRemoveWhere(kv, "director:index:x", (item) => item.id === "b");
  assert.deepEqual(await kv.get("director:index:x"), [{ id: "a" }, { id: "c" }]);

  await kvListRemoveWhere(kv, "director:index:x", () => true);
  assert.equal(await kv.get("director:index:x"), undefined);
});
