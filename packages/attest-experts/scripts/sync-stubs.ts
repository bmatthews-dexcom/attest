#!/usr/bin/env node
/**
 * Enumerate every attest expert source and generate a stub BDK agent for the
 * ones not yet ported. Idempotent: safe to re-run; concrete experts are left
 * alone, stub files are rewritten.
 *
 * Usage:
 *   tsx scripts/sync-stubs.ts [--check]
 *
 * `--check` fails (exit 1) if the generated files would differ from what is
 * on disk — wire into CI once this package has one.
 *
 * Expected cwd: packages/attest-experts/. The attest repo root is resolved
 * via `--attest-root <path>` or `ATTEST_ROOT` (defaults to the git toplevel
 * three dirs up — i.e. the standard monorepo layout where this package lives
 * at `packages/attest-experts/`).
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { execSync } from "node:child_process";

import { CONCRETE_IDS, type ExpertCluster, type ExpertMetadata } from "../lib/expert-registry.js";

type AttestFrontmatter = {
  description?: string;
  mode?: string;
  name?: string;
};

const PACKAGE_DIR = resolve(dirname(new URL(import.meta.url).pathname), "..");
const AGENTS_DIR = join(PACKAGE_DIR, "agents");
const REGISTRY_FILE = join(PACKAGE_DIR, "lib", "experts.generated.json");

function resolveAttestRoot(): string {
  const flagIdx = process.argv.indexOf("--attest-root");
  if (flagIdx !== -1 && process.argv[flagIdx + 1]) {
    return resolve(process.argv[flagIdx + 1]);
  }
  if (process.env.ATTEST_ROOT) {
    return resolve(process.env.ATTEST_ROOT);
  }
  try {
    const top = execSync("git rev-parse --show-toplevel", {
      cwd: PACKAGE_DIR,
      encoding: "utf8",
    }).trim();
    return top;
  } catch {
    return resolve(PACKAGE_DIR, "..", "..");
  }
}

function parseFrontmatter(markdown: string): AttestFrontmatter | undefined {
  if (!markdown.startsWith("---")) return undefined;
  const end = markdown.indexOf("\n---", 3);
  if (end === -1) return undefined;
  const block = markdown.slice(3, end).trim();
  const result: AttestFrontmatter = {};
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
    (result as Record<string, string>)[key] = value;
  }
  return result;
}

function listMarkdown(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      listMarkdown(full, acc);
    } else if (name.endsWith(".md")) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * Skip-list — files under `agents/` that are NOT dispatchable experts:
 *   - `agents/shared/**` (protocol / reference docs, mode:all)
 *   - `agents/templates/**`
 *   - `agents/test/**` (currently just E2E_INFRASTRUCTURE.md, a reference)
 *   - METHODOLOGY / SCHEMA / PROTOCOL docs anywhere
 *   - `agents/sdlc/PARALLEL_WAVE_PROTOCOL.md`
 */
function isExpertSource(relPath: string, frontmatter: AttestFrontmatter | undefined): boolean {
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

function clusterOf(relPath: string): ExpertCluster {
  if (relPath.startsWith("agents/security/")) return "security";
  if (relPath.startsWith("agents/code-review/")) return "code-review";
  if (relPath.startsWith("agents/performance/")) return "performance";
  if (relPath.startsWith("agents/game/")) return "game";
  if (relPath.startsWith("agents/sdlc/onboard/")) return "onboarding";
  const parts = relPath.split("/");
  if (parts.length === 2) {
    const fm = undefined;
    void fm;
    return "primary";
  }
  return "primary";
}

/**
 * Expert id — kebab-case of the source filename minus `.md`. Cluster sub-dirs
 * do NOT get prefixed because the sibling MCP's `list_experts` uses the bare
 * filename; keeping the ids flat matches that contract.
 */
function idOf(relPath: string): string {
  const base = relPath.split("/").pop() ?? "";
  return base.replace(/\.md$/, "").toLowerCase();
}

function summaryOf(fm: AttestFrontmatter): string {
  const desc = (fm.description ?? "").trim();
  if (desc.length <= 220) return desc;
  return desc.slice(0, 217).trimEnd() + "…";
}

function discover(attestRoot: string): ExpertMetadata[] {
  const found: ExpertMetadata[] = [];
  const files = listMarkdown(join(attestRoot, "agents"));
  for (const abs of files) {
    const rel = relative(attestRoot, abs).replaceAll("\\", "/");
    const text = readFileSync(abs, "utf8");
    const fm = parseFrontmatter(text);
    if (!isExpertSource(rel, fm)) continue;
    found.push({
      id: idOf(rel),
      source: rel,
      cluster: clusterOf(rel),
      status: CONCRETE_IDS.has(idOf(rel)) ? "concrete" : "stub",
      summary: summaryOf(fm!),
    });
  }
  found.sort((a, b) => a.id.localeCompare(b.id));
  return found;
}

function stubAgentTs(meta: ExpertMetadata): string {
  return [
    `// TODO Phase 2: full persona port + eval`,
    `// Source: ${meta.source}`,
    `import { defineStubExpert } from "../../../lib/expert-factory.js";`,
    `import type { ExpertMetadata } from "../../../lib/expert-registry.js";`,
    ``,
    `const META: ExpertMetadata = ${JSON.stringify(meta, null, 2).replace(/^"(\w+)":/gm, "$1:")};`,
    ``,
    `export default defineStubExpert(META);`,
    ``,
  ].join("\n");
}

function stubInstructionsMd(meta: ExpertMetadata): string {
  return [
    `# attest expert — ${meta.id} (STUB)`,
    ``,
    `**Cluster:** ${meta.cluster}   **Attest source:** \`${meta.source}\``,
    ``,
    `${meta.summary}`,
    ``,
    `## TODO Phase 2: full persona port + eval`,
    ``,
    `This expert is not yet ported to the attest-experts BDK pack. The id and dispatch`,
    `surface exist so the conductor can bind to it. On any invocation, call the tool`,
    `\`refuse_not_ported({ task_id })\` immediately and return — do not attempt the task.`,
    ``,
    `Porting path: copy an existing concrete expert (e.g. \`agents/security-auditor/\`),`,
    `swap the registry row and the persona-section of \`instructions.md\`, write one`,
    `eval under \`evals/<id>.eval.ts\`.`,
    ``,
  ].join("\n");
}

function stubToolTs(meta: ExpertMetadata): string {
  return [
    `// TODO Phase 2: full persona port + eval`,
    `import { notPortedTool } from "../../../../lib/not-ported-tool.js";`,
    ``,
    `export default notPortedTool(${JSON.stringify(meta.id)});`,
    ``,
  ].join("\n");
}

function writeIfChanged(path: string, contents: string, check: boolean, diffs: string[]): boolean {
  const existing = existsSync(path) ? readFileSync(path, "utf8") : null;
  if (existing === contents) return false;
  if (check) {
    diffs.push(path);
    return true;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
  return true;
}

function generate(experts: ExpertMetadata[], check: boolean): string[] {
  const diffs: string[] = [];
  for (const meta of experts) {
    if (meta.status === "concrete") continue;
    const dir = join(AGENTS_DIR, meta.id, "bot");
    writeIfChanged(join(dir, "agent.ts"), stubAgentTs(meta), check, diffs);
    writeIfChanged(join(dir, "instructions.md"), stubInstructionsMd(meta), check, diffs);
    writeIfChanged(join(dir, "tools", "refuse-not-ported.ts"), stubToolTs(meta), check, diffs);
  }
  const registryJson = JSON.stringify(experts, null, 2) + "\n";
  writeIfChanged(REGISTRY_FILE, registryJson, check, diffs);
  return diffs;
}

function removeStaleStubs(experts: ExpertMetadata[], check: boolean, diffs: string[]): void {
  if (!existsSync(AGENTS_DIR)) return;
  const expected = new Set(experts.map((e) => e.id));
  for (const name of readdirSync(AGENTS_DIR)) {
    const full = join(AGENTS_DIR, name);
    if (!statSync(full).isDirectory()) continue;
    if (expected.has(name)) continue;
    if (check) {
      diffs.push(`${full} (orphan, would delete)`);
      continue;
    }
    rmSync(full, { recursive: true, force: true });
  }
}

async function main() {
  const attestRoot = resolveAttestRoot();
  if (!existsSync(join(attestRoot, "agents"))) {
    console.error(`sync-stubs: cannot find agents/ under ${attestRoot}`);
    process.exit(2);
  }
  const experts = discover(attestRoot);
  const concreteButMissing = [...CONCRETE_IDS].filter((id) => !experts.some((e) => e.id === id));
  if (concreteButMissing.length) {
    console.error(
      `sync-stubs: CONCRETE_EXPERTS references ids not found in attest source: ${concreteButMissing.join(", ")}`,
    );
    process.exit(2);
  }
  const check = process.argv.includes("--check");
  const diffs: string[] = [];
  removeStaleStubs(experts, check, diffs);
  const written = generate(experts, check);
  diffs.push(...written);
  const concreteCount = experts.filter((e) => e.status === "concrete").length;
  const stubCount = experts.filter((e) => e.status === "stub").length;
  console.log(
    `sync-stubs: ${experts.length} experts total — ${concreteCount} concrete, ${stubCount} stubs. Registry: ${relative(PACKAGE_DIR, REGISTRY_FILE)}`,
  );
  if (check && diffs.length) {
    console.error(`sync-stubs: ${diffs.length} file(s) would change:`);
    for (const d of diffs) console.error(`  ${d}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
