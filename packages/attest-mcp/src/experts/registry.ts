/**
 * experts/registry.ts — enumerate attest's primary expert agents and project
 * each one as a stable catalog entry consumable by:
 *
 *   - the `list_experts` MCP tool
 *   - the `attest://experts/catalog` resource (same payload, resource shape)
 *   - the `attest://experts/<id>` per-expert resources (persona + routing
 *     rationale + tool allowlist for the sibling `packages/attest-experts`
 *     BDK agents to consume at build or runtime)
 *   - `route_goal`'s `invocation_hint` field (so the orchestrator can go
 *     straight to spawning the right BDK agent after a successful route)
 *
 * ID derivation rule (documented in the README too — keep both in sync):
 *   expert id = attest primary agent filename minus `.md`
 *   e.g. agents/security-auditor.md → id "security-auditor"
 *        agents/code-reviewer.md    → id "code-reviewer"
 *        agents/sdlc-lead.md        → id "sdlc-lead"
 *
 * Rationale: filenames are the stable, build-script-driven identifier across
 * attest + attest-claude + attest-cursor; using them avoids a parallel
 * naming scheme the sibling worker would have to maintain by hand.
 *
 * The sibling package name is pinned here as a constant; keep in sync with
 * whatever the feat/attest-experts worker chooses for its `name` field.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { attestRoot } from "../sources.js";
import { PHASES, PhaseId } from "../phase-gate/state-machine.js";
import { ROUTING_TABLE } from "../routing/table.js";
import { isPorted } from "./ported.js";

export const EXPERTS_PACKAGE = "@bpmforge/attest-experts";

export interface ExpertInvocationHint {
  readonly package: string;
  readonly agent: string;
  /** Short free-text so the orchestrator can log a readable dispatch. */
  readonly spawn: string;
}

export interface ExpertDescriptor {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly cluster: ExpertCluster;
  readonly invocationHint: ExpertInvocationHint;
  readonly recommendedPhases: PhaseId[];
  readonly requiredTools: string[];
  readonly promptName: string;
  readonly path: string;
  /**
   * True when this expert ships as a concrete BDK agent in
   * `@bpmforge/attest-experts`. False means the sibling pack still exposes
   * only a `refuse-not-ported` stub for this id — orchestrators should
   * route around it or escalate. See src/experts/ported.ts for the
   * resolution source (env override → attest-experts manifest → hardcoded
   * Phase-1 fallback).
   */
  readonly ported: boolean;
}

export type ExpertCluster =
  | "sdlc"
  | "security"
  | "code-quality"
  | "performance"
  | "architecture"
  | "api"
  | "data"
  | "ux"
  | "testing"
  | "ops"
  | "release"
  | "research"
  | "cost"
  | "analytics"
  | "integration"
  | "orchestration"
  | "other";

// ── Static enrichment maps ─────────────────────────────────────────────────
// Attest primaries don't declare `tools:` or phase-affinity in frontmatter.
// Rather than ad-hoc parsing agent bodies (brittle), we maintain a small
// side table that stamps every known primary with a cluster, the SDLC
// phases where it typically fires, and a conservative default tool list.
// A primary that isn't in this map falls back to `other`, every phase, and
// the "default" toolbelt — downstream consumers can still use it.
interface ExpertEnrichment {
  readonly cluster: ExpertCluster;
  readonly phases: PhaseId[];
  readonly tools: string[];
}

const DEFAULT_TOOLS = ["read", "grep", "glob", "bash"];
const CODING_TOOLS = ["read", "grep", "glob", "bash", "write", "edit"];
const RESEARCH_TOOLS = ["read", "grep", "glob", "webfetch", "websearch"];

const ENRICHMENT: Record<string, ExpertEnrichment> = {
  "sdlc-lead": {
    cluster: "orchestration",
    phases: [
      "phase-0",
      "phase-1",
      "phase-2",
      "phase-3",
      "phase-3.5",
      "phase-4",
      "phase-5",
    ],
    tools: [...CODING_TOOLS, "task"],
  },
  guide: {
    cluster: "orchestration",
    phases: [],
    tools: DEFAULT_TOOLS,
  },
  "security-auditor": {
    cluster: "security",
    phases: ["phase-3", "phase-4", "phase-5", "security-deep"],
    tools: [...DEFAULT_TOOLS, "semgrep"],
  },
  "code-reviewer": {
    cluster: "code-quality",
    phases: ["phase-4", "phase-5"],
    tools: DEFAULT_TOOLS,
  },
  "performance-engineer": {
    cluster: "performance",
    phases: ["phase-4", "phase-5"],
    tools: [...CODING_TOOLS, "playwright"],
  },
  "architecture-designer": {
    cluster: "architecture",
    phases: ["phase-3", "phase-3.5"],
    tools: DEFAULT_TOOLS,
  },
  "api-designer": {
    cluster: "api",
    phases: ["phase-3"],
    tools: DEFAULT_TOOLS,
  },
  "db-architect": {
    cluster: "data",
    phases: ["phase-3", "phase-4"],
    tools: DEFAULT_TOOLS,
  },
  "data-steward": {
    cluster: "data",
    phases: ["phase-3", "phase-5"],
    tools: DEFAULT_TOOLS,
  },
  "migration-planner": {
    cluster: "data",
    phases: ["phase-3", "phase-4"],
    tools: DEFAULT_TOOLS,
  },
  "ux-engineer": {
    cluster: "ux",
    phases: ["phase-2", "phase-3", "phase-4"],
    tools: [...CODING_TOOLS, "playwright"],
  },
  "frontend-design": {
    cluster: "ux",
    phases: ["phase-4"],
    tools: CODING_TOOLS,
  },
  "design-iterator": {
    cluster: "ux",
    phases: ["phase-3", "phase-4"],
    tools: CODING_TOOLS,
  },
  "ui-verifier": {
    cluster: "ux",
    phases: ["phase-4", "phase-5"],
    tools: [...CODING_TOOLS, "playwright"],
  },
  "a11y-compliance": {
    cluster: "ux",
    phases: ["phase-4", "phase-5"],
    tools: [...CODING_TOOLS, "playwright"],
  },
  "end-user-simulator": {
    cluster: "ux",
    phases: ["phase-5"],
    tools: [...CODING_TOOLS, "playwright"],
  },
  "test-engineer": {
    cluster: "testing",
    phases: ["phase-3.5", "phase-4", "phase-5"],
    tools: CODING_TOOLS,
  },
  "qa-vnv-engineer": {
    cluster: "testing",
    phases: ["phase-5"],
    tools: [...CODING_TOOLS, "playwright"],
  },
  "container-ops": {
    cluster: "ops",
    phases: ["phase-4", "phase-5"],
    tools: CODING_TOOLS,
  },
  "sre-engineer": {
    cluster: "ops",
    phases: ["phase-4", "phase-5"],
    tools: CODING_TOOLS,
  },
  "reliability-engineer": {
    cluster: "ops",
    phases: ["phase-5"],
    tools: CODING_TOOLS,
  },
  "cost-engineer": {
    cluster: "cost",
    phases: ["phase-3", "phase-5"],
    tools: DEFAULT_TOOLS,
  },
  "analytics-architect": {
    cluster: "analytics",
    phases: ["phase-3", "phase-4"],
    tools: DEFAULT_TOOLS,
  },
  "llm-integration-engineer": {
    cluster: "integration",
    phases: ["phase-3", "phase-4"],
    tools: CODING_TOOLS,
  },
  researcher: {
    cluster: "research",
    phases: [],
    tools: RESEARCH_TOOLS,
  },
  challenger: {
    cluster: "code-quality",
    phases: ["phase-3", "phase-4", "phase-5"],
    tools: DEFAULT_TOOLS,
  },
  "release-manager": {
    cluster: "release",
    phases: ["phase-5"],
    tools: CODING_TOOLS,
  },
  "git-expert": {
    cluster: "release",
    phases: [],
    tools: CODING_TOOLS,
  },
  "changelog-writer": {
    cluster: "release",
    phases: ["phase-5"],
    tools: CODING_TOOLS,
  },
  "coding-agent": {
    cluster: "code-quality",
    phases: ["phase-4"],
    tools: CODING_TOOLS,
  },
  "task-decomposer": {
    cluster: "orchestration",
    phases: [],
    tools: DEFAULT_TOOLS,
  },
  "documentation-gap-finder": {
    cluster: "code-quality",
    phases: ["phase-2", "phase-3", "phase-4", "phase-5"],
    tools: DEFAULT_TOOLS,
  },
  "gauntlet-lead": {
    cluster: "orchestration",
    phases: ["phase-4", "phase-5"],
    tools: DEFAULT_TOOLS,
  },
};

function parseFrontmatter(text: string): Record<string, string> {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  const out: Record<string, string> = {};
  if (!m) return out;
  for (const line of m[1].split("\n")) {
    if (/^\s/.test(line)) continue;
    const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return out;
}

function titleFromId(id: string): string {
  return id
    .split("-")
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(" ");
}

let cached: ExpertDescriptor[] | null = null;

export function listExperts(): ExpertDescriptor[] {
  if (cached) return cached;
  const dir = join(attestRoot().root, "agents");
  const out: ExpertDescriptor[] = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (!statSync(abs).isFile()) continue;
    if (!entry.endsWith(".md")) continue;
    const text = readFileSync(abs, "utf8");
    const fm = parseFrontmatter(text);
    if (fm.mode !== "primary") continue;

    const id = basename(entry, ".md");
    const enrichment: ExpertEnrichment =
      ENRICHMENT[id] ?? {
        cluster: "other",
        phases: [],
        tools: DEFAULT_TOOLS,
      };
    out.push({
      id,
      name: titleFromId(id),
      summary:
        fm.description ||
        `${titleFromId(id)} — attest primary expert agent (see agents/${entry})`,
      cluster: enrichment.cluster,
      invocationHint: {
        package: EXPERTS_PACKAGE,
        agent: id,
        spawn: `spawn ${EXPERTS_PACKAGE} agent "${id}"`,
      },
      recommendedPhases: enrichment.phases,
      requiredTools: enrichment.tools,
      promptName: `prompt_expert_${id.replace(/-/g, "_")}`,
      path: abs,
      ported: isPorted(id),
    });
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  cached = out;
  // Sanity: PHASES is only used at the type level in the public shape, but
  // keep an import-live reference so lint/tooling never prunes it.
  void PHASES;
  return out;
}

export function expertById(id: string): ExpertDescriptor | undefined {
  return listExperts().find((e) => e.id === id);
}

/**
 * Minimal payload used by `list_experts` (tool) and `attest://experts/catalog`
 * (resource). Deliberately omits the full persona body — fetch
 * `attest://experts/<id>` for that.
 */
export function expertCatalogJSON(): object {
  return {
    source:
      "derived from agents/*.md where frontmatter mode == 'primary' (attest canonical)",
    idRule:
      "expert id = attest primary agent filename minus '.md' (e.g. security-auditor.md -> 'security-auditor')",
    package: EXPERTS_PACKAGE,
    count: listExperts().length,
    experts: listExperts().map((e) => ({
      id: e.id,
      name: e.name,
      summary: e.summary,
      cluster: e.cluster,
      invocationHint: e.invocationHint,
      recommendedPhases: e.recommendedPhases,
      requiredTools: e.requiredTools,
      promptName: e.promptName,
      ported: e.ported,
    })),
  };
}

/**
 * Full per-expert manifest for `attest://experts/<id>`. Includes the whole
 * persona markdown so the sibling BDK agents can read it directly.
 */
export function expertManifestJSON(id: string): object {
  const e = expertById(id);
  if (!e) throw new Error(`unknown expert: ${id}`);
  const persona = readFileSync(e.path, "utf8");
  // Routing rationale(s) that mention this expert in the /guide table.
  const routing = ROUTING_TABLE.filter((row) => row.agent === e.id).map((row) => ({
    command: row.command,
    rationale: row.rationale,
    patterns: row.patterns,
  }));
  return {
    id: e.id,
    name: e.name,
    summary: e.summary,
    cluster: e.cluster,
    invocationHint: e.invocationHint,
    recommendedPhases: e.recommendedPhases,
    requiredTools: e.requiredTools,
    promptName: e.promptName,
    sourcePath: e.path,
    routing,
    persona,
    ported: e.ported,
  };
}

/**
 * Convenience for `route_goal`: given an agent name as it appears in the
 * routing table, resolve the invocation hint if the agent is a known
 * primary expert. Non-matches (e.g. "task-decomposer -> run-plan.mjs" or
 * free-text labels) return null so the router can degrade cleanly.
 */
export function invocationHintForAgent(
  agentLabel: string,
): ExpertInvocationHint | null {
  // The /guide table carries labels like "security-auditor" verbatim; a few
  // entries use free-text like "game cluster (sdlc-lead with --game)". We
  // match on the first bare id-looking token.
  const normalized = agentLabel.trim().toLowerCase();
  const direct = expertById(normalized);
  if (direct) return direct.invocationHint;
  const first = normalized.split(/[^a-z0-9-]+/)[0];
  if (first) {
    const match = expertById(first);
    if (match) return match.invocationHint;
  }
  return null;
}
