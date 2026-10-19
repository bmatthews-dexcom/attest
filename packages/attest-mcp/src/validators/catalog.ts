/**
 * validators/catalog.ts — discover the attest validator shell scripts and
 * project each one as an MCP tool.
 *
 * Discovery is filesystem-driven (not a static list) so the catalog stays in
 * sync with attest's `scripts/validators/` on upgrade. We exclude:
 *   - _lib.sh, _lib_sdlc_config.sh (sourced helpers, not standalone validators)
 *   - run-coverage-loop.sh, run-handoff-gates.sh (orchestrators that spawn
 *     validators themselves — exposing them via MCP would double-wrap the
 *     tool catalog)
 *   - validate-phase-gate.sh (reserved — surfaced as the dedicated
 *     `phase_gate_check` tool instead; see src/phase-gate/)
 *   - validate-scope.match.test.sh (test harness for the matcher helper
 *     inside validate-scope.sh, not a validator)
 *
 * Everything else (79 validators as of attest v3.9.0) becomes a tool whose
 * name is `validate_<id>` where <id> is the file basename with the
 * `validate-` prefix stripped and dashes replaced by underscores (MCP tool
 * names cannot contain `-` in all client UIs reliably).
 */

import { readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { attestRoot } from "../sources.js";

export interface ValidatorDescriptor {
  /** Canonical id, kebab-case, e.g. "owasp". */
  readonly id: string;
  /** MCP tool name, snake_case, e.g. "validate_owasp". */
  readonly toolName: string;
  /** Absolute path to the shell script. */
  readonly scriptPath: string;
  /** Rough category inferred from the id. Documented in the README. */
  readonly category: ValidatorCategory;
  /** First-doc line from the script's leading comment block, best-effort. */
  readonly summary: string;
}

export type ValidatorCategory =
  | "architecture"
  | "api"
  | "data"
  | "security"
  | "quality"
  | "testing"
  | "process"
  | "release"
  | "docs"
  | "requirements"
  | "ux"
  | "ops"
  | "other";

const EXCLUDED_FILES = new Set([
  "_lib.sh",
  "_lib_sdlc_config.sh",
  "run-coverage-loop.sh",
  "run-handoff-gates.sh",
  "validate-phase-gate.sh",
  "validate-scope.match.test.sh",
  "README.md",
]);

const CATEGORY_RULES: Array<[RegExp, ValidatorCategory]> = [
  [/^(owasp|security-controls|challenger-gate|vendor-provenance)$/, "security"],
  [
    /^(architecture|c3-coverage|erd-coverage|mermaid|sequence-coverage|flows|module-(design|boundaries(-transitive)?)|infrastructure|observability|resilience-patterns|entry-points|circular-deps|design-tokens|design-system|adrs|tech-stack|seams|invariants)$/,
    "architecture",
  ],
  [/^(api-coverage|api-consistency|contract-conformance)$/, "api"],
  [/^(data-governance|migrations|erd-coverage)$/, "data"],
  [
    /^(build|lint|dead-code|code-health|file-size|no-ascii-art|no-reinvent)$/,
    "quality",
  ],
  [/^(tests|tests-mapping|test-design|e2e-setup|qa-evidence)$/, "testing"],
  [/^(ux-spec|wcag-coverage)$/, "ux"],
  [/^(iac|smoke)$/, "ops"],
  [
    /^(release-readiness|fix-backlog-closed|model-pins|deps|close-receipt)$/,
    "release",
  ],
  [
    /^(doc-catalog|doc-counts|doc-render-health|book-structure|inventory|improve-coverage|handoff-discipline|completion-manifest|rules)$/,
    "docs",
  ],
  [
    /^(requirements-matrix|user-stories|use-cases|spec-traceability|requirement-closure|feature-coverage)$/,
    "requirements",
  ],
  [
    /^(tickets|ticket-hygiene|scope|autonomy-ledger|autonomy-wiring|loop-readiness|persistence-block|state-drift|status-freshness|tracker-fresh|tracker-integrity|jira-hygiene)$/,
    "process",
  ],
];

export function categorize(id: string): ValidatorCategory {
  for (const [re, cat] of CATEGORY_RULES) if (re.test(id)) return cat;
  return "other";
}

export function toolNameForValidator(id: string): string {
  // MCP tool names: snake_case, [a-z0-9_]. Replace any non-alnum with `_`.
  const safe = id.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  return `validate_${safe}`;
}

/**
 * Pull the first non-shebang, non-blank comment line out of a shell script's
 * header, used as the MCP tool description.
 */
function extractSummary(scriptPath: string): string {
  try {
    const fs = require("node:fs") as typeof import("node:fs");
    const text = fs.readFileSync(scriptPath, "utf8");
    const lines = text.split("\n").slice(0, 30);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith("#!")) continue;
      if (!line.startsWith("#")) break;
      // Strip leading `# ` and anything of the form "name.sh -- ".
      const body = line.replace(/^#\s?/, "").trim();
      if (!body) continue;
      const match = body.match(/^[a-zA-Z0-9_.-]+\.sh\s*[-–—]+\s*(.+)$/);
      if (match) return match[1].trim();
      return body;
    }
  } catch {
    /* fall through */
  }
  return "attest validator (see script header for details).";
}

let cached: ValidatorDescriptor[] | null = null;

export function listValidators(): ValidatorDescriptor[] {
  if (cached) return cached;
  const dir = join(attestRoot().root, "scripts", "validators");
  const entries: ValidatorDescriptor[] = [];
  for (const name of readdirSync(dir)) {
    if (EXCLUDED_FILES.has(name)) continue;
    if (!name.startsWith("validate-")) continue;
    if (!name.endsWith(".sh")) continue;
    const full = join(dir, name);
    if (!statSync(full).isFile()) continue;
    const id = name.replace(/^validate-/, "").replace(/\.sh$/, "");
    entries.push({
      id,
      toolName: toolNameForValidator(id),
      scriptPath: full,
      category: categorize(id),
      summary: extractSummary(full),
    });
  }
  entries.sort((a, b) => a.id.localeCompare(b.id));
  cached = entries;
  return entries;
}

export function validatorById(id: string): ValidatorDescriptor | undefined {
  return listValidators().find((v) => v.id === id);
}

export function validatorByToolName(
  toolName: string,
): ValidatorDescriptor | undefined {
  return listValidators().find((v) => v.toolName === toolName);
}
