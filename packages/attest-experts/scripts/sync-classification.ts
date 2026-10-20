#!/usr/bin/env node
/**
 * Shape C synchronizer. Reads the typed classification manifest in
 * `lib/classification.ts`, discovers every expert in attest's `agents/`
 * directory, cross-checks the two, writes `lib/classification.generated.json`
 * (JSON mirror consumers can read without TS tooling), and keeps the
 * attest-experts BDK agent tree in sync — scaffolding stubs for every
 * `sandbox-required` expert plus the three Phase-1 concretes, and
 * refusing to leave `in-process-eligible` stubs on disk.
 *
 * Usage:
 *   tsx scripts/sync-classification.ts [--check]
 *
 * `--check` fails (exit 1) when anything on disk would change. Wire into
 * CI so classification drift never slips through.
 *
 * Expected cwd: packages/attest-experts/. The attest repo root is
 * resolved via `--attest-root <path>`, `ATTEST_ROOT`, or `git rev-parse
 * --show-toplevel` (which, in this monorepo, is also the attest root).
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { execSync } from "node:child_process";

import {
  CLASSIFICATION,
  SANDBOX_FORCING_KINDS,
  sandboxExpertIds,
  type ExpertClassification,
  type ExpertClassificationEntry,
} from "../lib/classification.js";
import { CONCRETE_IDS, type ExpertCluster, type ExpertMetadata } from "../lib/expert-registry.js";

type AttestFrontmatter = {
  description?: string;
  mode?: string;
  name?: string;
};

const PACKAGE_DIR = resolve(dirname(new URL(import.meta.url).pathname), "..");
const AGENTS_DIR = join(PACKAGE_DIR, "agents");
const EXPERTS_REGISTRY_FILE = join(PACKAGE_DIR, "lib", "experts.generated.json");
const CLASSIFICATION_FILE = join(PACKAGE_DIR, "lib", "classification.generated.json");

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
  return "primary";
}

function idOf(relPath: string): string {
  const base = relPath.split("/").pop() ?? "";
  return base.replace(/\.md$/, "").toLowerCase();
}

function summaryOf(fm: AttestFrontmatter): string {
  const desc = (fm.description ?? "").trim();
  if (desc.length <= 220) return desc;
  return desc.slice(0, 217).trimEnd() + "…";
}

interface DiscoveredExpert {
  id: string;
  sourceFile: string;
  cluster: ExpertCluster;
  summary: string;
}

function discover(attestRoot: string): DiscoveredExpert[] {
  const found: DiscoveredExpert[] = [];
  const files = listMarkdown(join(attestRoot, "agents"));
  for (const abs of files) {
    const rel = relative(attestRoot, abs).replaceAll("\\", "/");
    const text = readFileSync(abs, "utf8");
    const fm = parseFrontmatter(text);
    if (!isExpertSource(rel, fm)) continue;
    found.push({
      id: idOf(rel),
      sourceFile: rel,
      cluster: clusterOf(rel),
      summary: summaryOf(fm!),
    });
  }
  found.sort((a, b) => a.id.localeCompare(b.id));
  return found;
}

function assertRubricInvariants(experts: DiscoveredExpert[]): string[] {
  const errors: string[] = [];
  const discoveredIds = new Set(experts.map((e) => e.id));
  const classifiedIds = new Set(Object.keys(CLASSIFICATION));

  for (const id of discoveredIds) {
    if (!classifiedIds.has(id)) {
      errors.push(`attest expert '${id}' has no entry in CLASSIFICATION`);
    }
  }
  for (const id of classifiedIds) {
    if (!discoveredIds.has(id)) {
      errors.push(`CLASSIFICATION has '${id}' but no matching attest source was discovered`);
    }
  }

  for (const [id, entry] of Object.entries(CLASSIFICATION)) {
    const kinds = entry.requiredCapabilities.map((c) => c.kind);
    const forcesSandbox = kinds.some((k) => SANDBOX_FORCING_KINDS.includes(k));
    if (forcesSandbox && entry.classification !== "sandbox-required") {
      errors.push(
        `'${id}' declares sandbox-forcing capability (${kinds.filter((k) => SANDBOX_FORCING_KINDS.includes(k)).join(",")}) but is classified ${entry.classification}`,
      );
    }
    const expected = experts.find((e) => e.id === id);
    if (expected && entry.cluster !== expected.cluster) {
      errors.push(
        `'${id}' cluster mismatch: CLASSIFICATION says '${entry.cluster}', attest source implies '${expected.cluster}'`,
      );
    }
    if (expected && entry.sourceFile !== expected.sourceFile) {
      errors.push(
        `'${id}' sourceFile mismatch: CLASSIFICATION says '${entry.sourceFile}', attest discovery found '${expected.sourceFile}'`,
      );
    }
  }

  return errors;
}

function clusterSummary(): Record<string, Record<ExpertClassification, number>> {
  const out: Record<string, Record<ExpertClassification, number>> = {};
  const bump = (cluster: ExpertCluster, cls: ExpertClassification) => {
    const row = (out[cluster] ??= {
      "sandbox-required": 0,
      "in-process-eligible": 0,
      stub: 0,
    });
    row[cls] += 1;
  };
  for (const entry of Object.values(CLASSIFICATION)) {
    bump(entry.cluster, entry.classification);
  }
  return out;
}

function totalByClassification(): Record<ExpertClassification, number> {
  const totals: Record<ExpertClassification, number> = {
    "sandbox-required": 0,
    "in-process-eligible": 0,
    stub: 0,
  };
  for (const entry of Object.values(CLASSIFICATION)) {
    totals[entry.classification] += 1;
  }
  return totals;
}

interface ClassificationManifestPayload {
  _summary: {
    rubric: Record<string, string>;
    total: number;
    byClassification: Record<ExpertClassification, number>;
    byClusterByClassification: Record<string, Record<ExpertClassification, number>>;
    inProcessEligibleKeptAsSandbox: readonly string[];
  };
  [id: string]: unknown;
}

function buildManifestPayload(experts: DiscoveredExpert[]): ClassificationManifestPayload {
  const payload: ClassificationManifestPayload = {
    _summary: {
      rubric: {
        "sandbox-required":
          "needs write:fs to repo source, shell:destructive, git:write, pr:open, pr:merge, publish:npm, or env:write",
        "in-process-eligible":
          "needs only read:fs, shell:safe (deterministic, read-only), net:fetch, git:read",
        stub: "scaffold-only (no persona, placeholder); keep refusing until a real port",
      },
      total: experts.length,
      byClassification: totalByClassification(),
      byClusterByClassification: clusterSummary(),
      inProcessEligibleKeptAsSandbox: [
        "security-auditor",
        "code-reviewer",
        "landscape-mapper",
      ],
    },
  };
  for (const expert of experts) {
    const entry = CLASSIFICATION[expert.id];
    payload[expert.id] = {
      cluster: entry.cluster,
      classification: entry.classification,
      requiredCapabilities: entry.requiredCapabilities,
      rationale: entry.rationale,
      sourceFile: entry.sourceFile,
    };
  }
  return payload;
}

function buildExpertsRegistry(
  experts: DiscoveredExpert[],
  sandboxIds: ReadonlySet<string>,
): ExpertMetadata[] {
  const out: ExpertMetadata[] = [];
  for (const expert of experts) {
    if (!sandboxIds.has(expert.id)) continue;
    const entry = CLASSIFICATION[expert.id];
    const status = CONCRETE_IDS.has(expert.id) ? "concrete" : "stub";
    out.push({
      id: expert.id,
      source: entry.sourceFile,
      cluster: entry.cluster,
      status,
      summary: expert.summary,
    });
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

function stubAgentTs(meta: ExpertMetadata): string {
  const entry = CLASSIFICATION[meta.id];
  return [
    `// Shape C — sandbox-required BDK agent (stub pending full persona port + eval)`,
    `// Attest source: ${meta.source}`,
    `// Classification rationale: ${entry.rationale}`,
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
  const entry = CLASSIFICATION[meta.id];
  const capsBlock =
    entry.requiredCapabilities.length === 0
      ? "- _(baseline capabilities only)_"
      : entry.requiredCapabilities
          .map((c) => `- \`${c.kind}\` — ${c.scope}`)
          .join("\n");
  return [
    `# attest expert — ${meta.id} (sandbox-required stub)`,
    ``,
    `**Cluster:** ${meta.cluster}   **Attest source:** \`${meta.source}\``,
    ``,
    `${meta.summary}`,
    ``,
    `## Why this expert needs a sandbox BDK agent`,
    ``,
    `${entry.rationale}`,
    ``,
    `**Required capabilities beyond baseline:**`,
    ``,
    capsBlock,
    ``,
    `## TODO (Shape C Phase 2) — full persona port + eval`,
    ``,
    `This expert is scaffolded as a BDK agent so a cloud VM boots when the`,
    `chief escalates to it, but the persona itself is not yet ported. On any`,
    `invocation, call the tool \`refuse_not_ported({ task_id })\` immediately`,
    `and return.`,
    ``,
    `Porting path: copy an existing concrete expert (e.g. \`agents/security-auditor/\`),`,
    `swap the registry row and the persona-section of \`instructions.md\`,`,
    `write one eval under \`evals/<id>.eval.ts\`. The classification manifest`,
    `(\`lib/classification.generated.json\`) is the authoritative source for`,
    `which experts live here.`,
    ``,
  ].join("\n");
}

function stubToolTs(meta: ExpertMetadata): string {
  return [
    `// Shape C — sandbox-required stub refusal.`,
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

function writeStubsForSandbox(
  experts: ExpertMetadata[],
  check: boolean,
  diffs: string[],
): void {
  for (const meta of experts) {
    if (meta.status === "concrete") continue;
    const dir = join(AGENTS_DIR, meta.id, "bot");
    writeIfChanged(join(dir, "agent.ts"), stubAgentTs(meta), check, diffs);
    writeIfChanged(join(dir, "instructions.md"), stubInstructionsMd(meta), check, diffs);
    writeIfChanged(join(dir, "tools", "refuse-not-ported.ts"), stubToolTs(meta), check, diffs);
  }
}

function removeStaleAgents(
  sandboxIds: ReadonlySet<string>,
  check: boolean,
  diffs: string[],
): void {
  if (!existsSync(AGENTS_DIR)) return;
  for (const name of readdirSync(AGENTS_DIR)) {
    const full = join(AGENTS_DIR, name);
    if (!statSync(full).isDirectory()) continue;
    if (sandboxIds.has(name)) continue;
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
    console.error(`sync-classification: cannot find agents/ under ${attestRoot}`);
    process.exit(2);
  }
  const experts = discover(attestRoot);
  const invariantErrors = assertRubricInvariants(experts);
  if (invariantErrors.length) {
    console.error("sync-classification: invariant violations:");
    for (const err of invariantErrors) console.error(`  - ${err}`);
    process.exit(3);
  }
  const concreteButMissing = [...CONCRETE_IDS].filter((id) => !experts.some((e) => e.id === id));
  if (concreteButMissing.length) {
    console.error(
      `sync-classification: CONCRETE_EXPERTS references ids not found in attest source: ${concreteButMissing.join(", ")}`,
    );
    process.exit(3);
  }

  const check = process.argv.includes("--check");
  const diffs: string[] = [];
  const sandboxIds = sandboxExpertIds();

  const manifestPayload = buildManifestPayload(experts);
  const classificationJson = JSON.stringify(manifestPayload, null, 2) + "\n";
  writeIfChanged(CLASSIFICATION_FILE, classificationJson, check, diffs);

  const registryRows = buildExpertsRegistry(experts, sandboxIds);
  const registryJson = JSON.stringify(registryRows, null, 2) + "\n";
  writeIfChanged(EXPERTS_REGISTRY_FILE, registryJson, check, diffs);

  removeStaleAgents(sandboxIds, check, diffs);
  writeStubsForSandbox(registryRows, check, diffs);

  const totals = totalByClassification();
  console.log(
    `sync-classification: ${experts.length} experts classified — ` +
      `${totals["sandbox-required"]} sandbox-required, ` +
      `${totals["in-process-eligible"]} in-process-eligible, ` +
      `${totals.stub} stub.`,
  );
  console.log(
    `sync-classification: attest-experts/ now contains ${registryRows.length} sandbox-required agent(s) ` +
      `(${registryRows.filter((r) => r.status === "concrete").length} concrete, ` +
      `${registryRows.filter((r) => r.status === "stub").length} stub).`,
  );
  console.log(
    `sync-classification: wrote ${relative(PACKAGE_DIR, CLASSIFICATION_FILE)} and ${relative(PACKAGE_DIR, EXPERTS_REGISTRY_FILE)}.`,
  );

  if (check && diffs.length) {
    console.error(`sync-classification: ${diffs.length} file(s) would change:`);
    for (const d of diffs) console.error(`  ${d}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
