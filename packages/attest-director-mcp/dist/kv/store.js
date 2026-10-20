import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
class MemoryKvStore {
  map = /* @__PURE__ */ new Map();
  async get(key) {
    return this.map.get(key);
  }
  async put(key, value) {
    this.map.set(key, structuredClone(value));
  }
  async delete(key) {
    this.map.delete(key);
  }
  async listKeys(prefix) {
    const out = [];
    for (const k of this.map.keys()) {
      if (k.startsWith(prefix)) out.push(k);
    }
    return out.sort();
  }
  clear() {
    this.map.clear();
  }
  /** Test-only — borrow the inner map (do NOT mutate from outside tests). */
  _unsafeInner() {
    return this.map;
  }
}
function keyToPath(root, key) {
  const encoded = encodeURIComponent(key);
  return join(root, encoded + ".json");
}
class FileKvStore {
  constructor(root) {
    this.root = root;
  }
  root;
  static defaultRoot() {
    const envRoot = process.env.ATTEST_DIRECTOR_KV_ROOT;
    if (envRoot) return envRoot;
    return join(homedir(), ".attest-director", "kv");
  }
  async get(key) {
    const path = keyToPath(this.root, key);
    try {
      const raw = await readFile(path, "utf8");
      return JSON.parse(raw);
    } catch (err) {
      const e = err;
      if (e?.code === "ENOENT") return void 0;
      throw err;
    }
  }
  async put(key, value) {
    const path = keyToPath(this.root, key);
    await mkdir(dirname(path), { recursive: true });
    const serialized = JSON.stringify(value, null, 2);
    await writeFile(path, serialized, "utf8");
  }
  async delete(key) {
    const path = keyToPath(this.root, key);
    try {
      await rm(path);
    } catch (err) {
      const e = err;
      if (e?.code === "ENOENT") return;
      throw err;
    }
  }
  async listKeys(prefix) {
    let entries;
    try {
      entries = await readdir(this.root);
    } catch (err) {
      const e = err;
      if (e?.code === "ENOENT") return [];
      throw err;
    }
    const out = [];
    for (const file of entries) {
      if (!file.endsWith(".json")) continue;
      const key = decodeURIComponent(file.slice(0, -".json".length));
      if (key.startsWith(prefix)) out.push(key);
    }
    return out.sort();
  }
}
async function kvListAppend(kv, key, value, options = {}) {
  const existing = await kv.get(key) ?? [];
  const next = existing.slice();
  if (options.dedupe && next.some((e) => JSON.stringify(e) === JSON.stringify(value))) {
    return next;
  }
  next.push(value);
  if (options.max && next.length > options.max) {
    next.splice(0, next.length - options.max);
  }
  await kv.put(key, next);
  return next;
}
async function kvListRemoveWhere(kv, key, predicate) {
  const existing = await kv.get(key) ?? [];
  const next = existing.filter((item) => !predicate(item));
  if (next.length === 0) {
    await kv.delete(key);
  } else {
    await kv.put(key, next);
  }
  return next;
}
export {
  FileKvStore,
  MemoryKvStore,
  keyToPath,
  kvListAppend,
  kvListRemoveWhere
};
//# sourceMappingURL=store.js.map
