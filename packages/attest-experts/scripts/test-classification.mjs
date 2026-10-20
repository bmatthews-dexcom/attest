#!/usr/bin/env node
/**
 * Node test runner — asserts the Shape C classification manifest covers
 * every expert in attest's `agents/` directory exactly once, that every
 * sandbox-required expert has a scaffolded BDK agent dir in this package,
 * and that no in-process-eligible expert has a lingering BDK dir (that
 * would mean the prune never ran).
 *
 * This is the test the task spec names explicitly: "write a test that
 * asserts [the manifest covers every expert exactly once]".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = resolve(HERE, "..");
const CLASSIFICATION_FILE = resolve(PACKAGE_DIR, "lib", "classification.generated.json");
const EXPERTS_REGISTRY_FILE = resolve(PACKAGE_DIR, "lib", "experts.generated.json");
const AGENTS_DIR = resolve(PACKAGE_DIR, "agents");

function attestRoot() {
  if (process.env.ATTEST_ROOT) return resolve(process.env.ATTEST_ROOT);
  try {
    return execSync("git rev-parse --show-toplevel", { cwd: PACKAGE_DIR, encoding: "utf8" }).trim();
  } catch {
    return resolve(PACKAGE_DIR, "..", "..");
  }
}

function parseFrontmatter(markdown) {
  if (!markdown.startsWith("---")) return undefined;
  const end = markdown.indexOf("\n---", 3);
  if (end === -1) return undefined;
  const block = markdown.slice(3, end).trim();
  const out = {};
  for (const line of block.split("\n")) {
    const match = /^([a-zA-Z_][a-zA-Z0-9_-]*)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if (
      (value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function listMarkdown(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) listMarkdown(full, acc);
    else if (name.endsWith(".md")) acc.push(full);
  }
  return acc;
}

function isExpertSource(relPath, frontmatter) {
  if (!frontmatter?.description) return false;
  if (relPath.startsWith("agents/shared/")) return false;
  if (relPath.startsWith("agents/templates/")) return false;
  if (relPath.startsWith("agents/test/")) return false;
  const base = relPath.split("/").pop() ?? "";
  if (/^(METHODOLOGY|FINDINGS?_SCHEMA|FINDING_SCHEMA|.*_METHODOLOGY|.*_PROTOCOL|.*_SCHEMA)\.md$/i.test(base)) {
    return false;
  }
  if (base === "PARALLEL_WAVE_PROTOCOL.md") return false;
  return true;
}

function discover() {
  const root = attestRoot();
  const files = listMarkdown(join(root, "agents"));
  const ids = [];
  const byId = new Map();
  for (const abs of files) {
    const rel = relative(root, abs).replaceAll("\\", "/");
    const fm = parseFrontmatter(readFileSync(abs, "utf8"));
    if (!isExpertSource(rel, fm)) continue;
    const base = rel.split("/").pop() ?? "";
    const id = base.replace(/\.md$/, "").toLowerCase();
    ids.push(id);
    byId.set(id, { id, sourceFile: rel });
  }
  return { ids, byId };
}

function loadClassification() {
  return JSON.parse(readFileSync(CLASSIFICATION_FILE, "utf8"));
}

function loadRegistry() {
  return JSON.parse(readFileSync(EXPERTS_REGISTRY_FILE, "utf8"));
}

test("classification manifest covers every attest expert exactly once", () => {
  const { ids: discoveredIds } = discover();
  const manifest = loadClassification();
  const classifiedIds = Object.keys(manifest).filter((k) => k !== "_summary");

  const dupes = discoveredIds.filter((id, i) => discoveredIds.indexOf(id) !== i);
  assert.deepEqual(dupes, [], `attest discovery produced duplicate ids: ${dupes.join(",")}`);

  const missing = discoveredIds.filter((id) => !manifest[id]);
  assert.deepEqual(missing, [], `classification missing entries for: ${missing.join(",")}`);

  const extras = classifiedIds.filter((id) => !discoveredIds.includes(id));
  assert.deepEqual(extras, [], `classification has entries with no matching attest source: ${extras.join(",")}`);

  assert.equal(
    manifest._summary.total,
    discoveredIds.length,
    "_summary.total does not match discovered expert count",
  );
  const byCls = manifest._summary.byClassification;
  const sum = byCls["sandbox-required"] + byCls["in-process-eligible"] + byCls.stub;
  assert.equal(sum, discoveredIds.length, "_summary byClassification totals do not add up");
});

test("every manifest entry has rubric-correct capability shape", () => {
  const manifest = loadClassification();
  const sandboxForcingKinds = new Set([
    "write:fs",
    "shell:destructive",
    "git:write",
    "pr:open",
    "pr:merge",
    "publish:npm",
    "env:write",
  ]);
  const allowedInProcessKinds = new Set([
    "read:fs",
    "shell:safe",
    "net:fetch",
    "git:read",
  ]);
  for (const [id, entry] of Object.entries(manifest)) {
    if (id === "_summary") continue;
    assert.ok(["sandbox-required", "in-process-eligible", "stub"].includes(entry.classification),
      `${id}: unknown classification '${entry.classification}'`);
    assert.ok(entry.rationale && entry.rationale.length > 0, `${id}: empty rationale`);
    assert.ok(entry.sourceFile && entry.sourceFile.startsWith("agents/"), `${id}: bad sourceFile`);
    const kinds = entry.requiredCapabilities.map((c) => c.kind);
    const forces = kinds.some((k) => sandboxForcingKinds.has(k));
    if (forces) {
      assert.equal(entry.classification, "sandbox-required",
        `${id}: declares sandbox-forcing capability but classified ${entry.classification}`);
    }
    if (entry.classification === "in-process-eligible") {
      for (const k of kinds) {
        assert.ok(allowedInProcessKinds.has(k),
          `${id}: in-process-eligible but declares disallowed capability '${k}'`);
      }
    }
  }
});

test("attest-experts/ contains exactly the sandbox-required set + Phase-1 concretes", () => {
  const manifest = loadClassification();
  const expected = new Set();
  for (const [id, entry] of Object.entries(manifest)) {
    if (id === "_summary") continue;
    if (entry.classification === "sandbox-required") expected.add(id);
  }
  for (const id of ["security-auditor", "code-reviewer", "landscape-mapper"]) {
    expected.add(id);
  }
  const onDisk = new Set(
    readdirSync(AGENTS_DIR).filter((n) => statSync(join(AGENTS_DIR, n)).isDirectory()),
  );
  const missing = [...expected].filter((id) => !onDisk.has(id));
  const extras = [...onDisk].filter((id) => !expected.has(id));
  assert.deepEqual(missing, [], `agents/ missing dirs for: ${missing.join(",")}`);
  assert.deepEqual(extras, [], `agents/ has unexpected dirs: ${extras.join(",")}`);
});

test("experts.generated.json matches on-disk sandbox set", () => {
  const registry = loadRegistry();
  const registryIds = new Set(registry.map((e) => e.id));
  const onDisk = new Set(
    readdirSync(AGENTS_DIR).filter((n) => statSync(join(AGENTS_DIR, n)).isDirectory()),
  );
  assert.deepEqual([...registryIds].sort(), [...onDisk].sort(),
    "experts.generated.json ids do not match agents/ dirs");
  const concreteOnDisk = ["security-auditor", "code-reviewer", "landscape-mapper"];
  for (const row of registry) {
    const expected = concreteOnDisk.includes(row.id) ? "concrete" : "stub";
    assert.equal(row.status, expected, `${row.id}: expected status '${expected}', got '${row.status}'`);
  }
});
