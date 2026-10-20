/**
 * KV store abstraction — the Director MCP server backs its ledger here.
 *
 * Two implementations ship:
 *
 *   - `MemoryKvStore` — in-process map. Used by tests and the stub smoke
 *     path.
 *   - `FileKvStore` — one JSON file per key under a root directory. Default
 *     root is `~/.attest-director/kv/` (local-only; §8 distribution contract).
 *
 * The hosted BDK Director replaces this at wire time with Cursor-hosted
 * `ctx.host.kv`. The MCP server's indirection layer lets the sibling CLI
 * and tests run without the host — see `attest-director-mcp` README.
 */
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

export interface KvStore {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  listKeys(prefix: string): Promise<string[]>;
}

export class MemoryKvStore implements KvStore {
  private readonly map = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.map.get(key) as T | undefined;
  }

  async put(key: string, value: unknown): Promise<void> {
    this.map.set(key, structuredClone(value));
  }

  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }

  async listKeys(prefix: string): Promise<string[]> {
    const out: string[] = [];
    for (const k of this.map.keys()) {
      if (k.startsWith(prefix)) out.push(k);
    }
    return out.sort();
  }

  clear(): void {
    this.map.clear();
  }

  /** Test-only — borrow the inner map (do NOT mutate from outside tests). */
  _unsafeInner(): Map<string, unknown> {
    return this.map;
  }
}

/**
 * Deterministic key → filesystem path encoder. We percent-encode `/`, `:`,
 * and anything outside `[A-Za-z0-9._-]`. This keeps `director:core`,
 * `director:approval-index:owner/repo#12` and friends all round-tripping
 * cleanly on every filesystem.
 */
export function keyToPath(root: string, key: string): string {
  const encoded = encodeURIComponent(key);
  return join(root, encoded + ".json");
}

export class FileKvStore implements KvStore {
  constructor(private readonly root: string) {}

  static defaultRoot(): string {
    const envRoot = process.env.ATTEST_DIRECTOR_KV_ROOT;
    if (envRoot) return envRoot;
    return join(homedir(), ".attest-director", "kv");
  }

  async get<T>(key: string): Promise<T | undefined> {
    const path = keyToPath(this.root, key);
    try {
      const raw = await readFile(path, "utf8");
      return JSON.parse(raw) as T;
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e?.code === "ENOENT") return undefined;
      throw err;
    }
  }

  async put(key: string, value: unknown): Promise<void> {
    const path = keyToPath(this.root, key);
    await mkdir(dirname(path), { recursive: true });
    const serialized = JSON.stringify(value, null, 2);
    await writeFile(path, serialized, "utf8");
  }

  async delete(key: string): Promise<void> {
    const path = keyToPath(this.root, key);
    try {
      await rm(path);
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e?.code === "ENOENT") return;
      throw err;
    }
  }

  async listKeys(prefix: string): Promise<string[]> {
    let entries: string[];
    try {
      entries = await readdir(this.root);
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e?.code === "ENOENT") return [];
      throw err;
    }
    const out: string[] = [];
    for (const file of entries) {
      if (!file.endsWith(".json")) continue;
      const key = decodeURIComponent(file.slice(0, -".json".length));
      if (key.startsWith(prefix)) out.push(key);
    }
    return out.sort();
  }
}

/** Append `value` to a list stored at `key` (creates the list on demand). */
export async function kvListAppend<T>(
  kv: KvStore,
  key: string,
  value: T,
  options: { dedupe?: boolean; max?: number } = {},
): Promise<T[]> {
  const existing = ((await kv.get<T[]>(key)) ?? []) as T[];
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

/** Remove items from a list stored at `key` matching `predicate`. */
export async function kvListRemoveWhere<T>(
  kv: KvStore,
  key: string,
  predicate: (item: T) => boolean,
): Promise<T[]> {
  const existing = ((await kv.get<T[]>(key)) ?? []) as T[];
  const next = existing.filter((item) => !predicate(item));
  if (next.length === 0) {
    await kv.delete(key);
  } else {
    await kv.put(key, next);
  }
  return next;
}
