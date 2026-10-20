#!/usr/bin/env node
// build-target-cursor.mjs — Cursor build target (Shape C — hybrid chief).
//
// LOCAL-ONLY — attest-mcp, attest-experts, and attest-conductor live as
// workspace siblings in packages/attest-*/ and are NEVER fetched from
// the npm registry. The generated .cursor/* tree invokes them through
// local workspace paths; a missing local build is a loud error, not a
// silent download via `npx`'s auto-install flag.
//
// attest's expert personas live as BDK agents in the workspace sibling
// `attest-experts` (or as in-process handlers in `attest-mcp` post
// Shape C). The chief is split in two:
//
//   • hosted conductor (`attest-conductor`) — /autopilot and
//     GitHub-driven work;
//   • editor sdlc-lead (`.cursor/skills/sdlc-lead/SKILL.md` +
//     `.cursor/agents/sdlc-lead.md`) — interactive /sdlc from Cursor
//     chat, generated from the shared source
//     `agents/shared/chiefs/sdlc-lead.md`.
//
// Both chiefs share one policy engine (in `attest-mcp` post Shape C)
// and one `attest-experts` fleet. Reference:
//   docs/attest-chief-architecture.md
//     — §Recommendation (two front doors)
//     — §Migration path "cursor-build-target"
//
// Cursor-side surface this generator emits:
//
//   .cursor/rules/*.mdc        — attest shared protocols as @file-pointer
//                                 rules (editor-time guidance)
//   .cursor/agents/sdlc-lead.md — the editor-side chief as a Cursor
//                                 custom-mode / subagent definition
//   .cursor/hooks.json         — original dangerous-bash / credential-write
//                                 blockers + Shape-C policy-engine hooks
//   .cursor/hooks/*.sh         — the scripts those hooks run
//   .cursor/mcp.json           — three MCP servers:
//                                   • attest           (stdio, policy host)
//                                   • attest-conductor (hosted BDK chief)
//                                   • attest-policy-dev (local-dev LOG_ONLY
//                                                        policy engine)
//   .cursor/skills/*/          — technique/procedure skills + `sdlc-lead`
//                                 skill (teaches the local agent WHEN to
//                                 act as the chief) + `invoke-attest-
//                                 conductor` (how to dial out for autopilot)
//   .cursor/README.md          — explains the two-chief architecture,
//                                 fence/gate layers, and policy mode flip
//
// Deliberately NOT emitted:
//   .cursor/agents/*.md (primary experts) — ship as BDK agents or
//                                           in-process handlers; this is
//                                           the Shape-2 pattern we moved
//                                           away from.
//   .cursor/skills/<expert-persona>/      — same reason; see
//                                           PERSONA_SKILL_DROPS below.
//
// Mirrors `scripts/build-target-claude.mjs`:
//   - ordered PROSE then PATHS transforms (opencode-isms rewritten)
//   - `--check` CI drift gate / `--write` regenerates the tree
//   - skill-parity check (every source skill maps to an artifact or sits
//     on a cited drop/keep set — ambiguity logged, not silent)
//
// Usage:
//   node scripts/build-target-cursor.mjs --write [--out <dir>]
//   node scripts/build-target-cursor.mjs --check [--out <dir>]
//
// `--out` defaults to `<repo>/.cursor` so Cursor picks the generated tree
// up directly when a user installs this repo (design report §8-q1 (a)).
//
// Design report: /cursor/stores/.../docs/attest-cursor-integration.md
// (sections 4, 5, 6, 7).

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  rmSync,
  statSync,
  chmodSync,
} from 'node:fs';
import { join, dirname, relative, basename } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const argv = process.argv.slice(2);
const MODE = argv.includes('--write') ? 'write' : 'check';
const OUT = (() => {
  const i = argv.indexOf('--out');
  return i === -1 ? join(ROOT, '.cursor') : argv[i + 1];
})();

// ── SHAPE-C CONTRACT NAMES ──────────────────────────────────────────────
// These are the attest-mcp policy-engine tool names this build-target
// writes into the generated hooks + the sdlc-lead chief source. The
// sibling `feat/attest-mcp` worker owns adding them server-side; if that
// worker renames one, mirror it here in a single commit and regenerate.
//
// Chief architecture reference: `docs/attest-chief-architecture.md`
// §Fences inventory + §Gates inventory.
export const POLICY_TOOL_NAMES = {
  shell: 'evaluate_shell_policy',   // beforeShellExecution → attest-mcp
  write: 'evaluate_write_policy',   // preToolUse Write|Edit → attest-mcp
  mcp:   'evaluate_mcp_policy',     // (planned) beforeMcpInvoke mirror
  fences: 'list_fences',            // sdlc-lead orient step
  approval: 'request_approval',     // destructive-op gate (MCP elicitation)
  invoke: 'invoke_expert',          // policy-mediated expert dispatch
  preDispatch: 'pre_dispatch_check',// promotion gate for sandbox dispatch
};

// LOCAL-ONLY INVOCATION — HARD CONSTRAINT
//
// attest-mcp / attest-experts / attest-conductor are workspace siblings
// in this repo (`packages/attest-*/`). They are NEVER fetched from the
// npm registry. The hooks and mcp.json entries invoke the local workspace
// build output directly; a missing binary is a loud error, not a silent
// auto-install `npx` download.
//
// Package base names (unscoped — reflect the workspace package names,
// not any publication scope):
export const PKG_ATTEST_MCP = 'attest-mcp';
export const PKG_ATTEST_EXPERTS = 'attest-experts';
export const PKG_ATTEST_CONDUCTOR = 'attest-conductor';

// Local workspace build-output paths (relative to the repo root, where
// Cursor's MCP mcp.json and hook commands run from).
export const ATTEST_MCP_DIST_CLI = `./packages/${PKG_ATTEST_MCP}/dist/cli.js`;
export const ATTEST_CONDUCTOR_DIR = `./packages/${PKG_ATTEST_CONDUCTOR}`;

// CLI invocation chain the Shape-C policy hooks walk, in order:
//   1. `attest-mcp-policy evaluate --kind=<shell|write|mcp>`
//      — dedicated policy bin shipped by attest-mcp's `bin` field;
//        resolves via `./node_modules/.bin/` after `npm install`.
//   2. `attest-mcp policy --kind=<shell|write|mcp>`
//      — the main attest-mcp CLI's `policy` subcommand (compat path
//        the sibling attest-mcp worker is adding).
//   3. HARD FAIL — no fallback. The hooks never shell out to `npx`
//      with the auto-install flag, never pass `--package=…`, never
//      reach the registry under any flag.
//
// If neither bin resolves, the hook returns a crisp error naming the
// local install script the user should run.
export const POLICY_CLI_PRIMARY = 'attest-mcp-policy';
export const POLICY_CLI_SECONDARY = PKG_ATTEST_MCP; // "attest-mcp policy"
export const LOCAL_INSTALL_HINT = 'npm install at repo root (packages/* are workspace siblings; attest-mcp is NOT published to npm)';

// Env var that selects the Shape-C policy mode. ENFORCE = fail-closed on
// engine error or `deny`. LOG_ONLY = log the decision and allow through
// (dev/authoring mode — the sibling attest-mcp worker's AgentCore-style
// LOG_ONLY). OFF = skip the policy call entirely (local-only escape
// hatch for debugging; documented in .cursor/README.md).
export const POLICY_MODE_ENV = 'ATTEST_POLICY_MODE';
export const POLICY_MODES = ['ENFORCE', 'LOG_ONLY', 'OFF'];

// Shared chief source. Both `generateSdlcLeadSkill()` and
// `generateSdlcLeadAgent()` pull from this one file; the chief persona
// never lives in two places.
export const SDLC_LEAD_SHARED_SOURCE = 'agents/shared/chiefs/sdlc-lead.md';

// ── EXPLICITLY SKIPPED (per task + design report §6) ────────────────────
// Each entry pairs with a one-line reason. These files are OpenCode-only
// mechanics with no Cursor-equivalent surface; dropping them cleanly is
// the right port, not a translation. See attest-cursor-integration.md §5
// bullets 1-11 for the failure modes a naive file-copy produces.
export const DROPPED = {
  'plugins/resume-anchor.ts':
    "OpenCode-only experimental.chat.system.transform; Cursor's 200k-1M context models don't need per-turn disk-state re-injection (design report §6).",
  'dist/compact-agents/':
    'Compact variants exist for 32k local models; every Cursor-selectable model is frontier (design report §6, bullet 3).',
  'scripts/detect-model-context.sh':
    'Tier detection probes LM Studio; irrelevant on Cursor (design report §6, bullet 3).',
  'tools/task.ts':
    'Spawns `opencode run --agent`; Cursor Task tool is the native equivalent.',
  'tools/write.ts':
    'Atomic-write patch for an LM-Studio/OpenCode bug Cursor does not have.',
  'tools/append.ts': 'Same as tools/write.ts — LM-Studio/OpenCode patch.',
  'tools/update.ts': 'Same as tools/write.ts — LM-Studio/OpenCode patch.',
  'agents/':
    'ORCHESTRATOR-FIRST ARCHITECTURE: expert personas ship as BDK agents in the workspace sibling package `attest-experts`, spawned on demand by `attest-conductor`. The local Cursor Agent calls out to the conductor via MCP; it does not host the personas itself. **Exception**: the chief personas (sdlc-lead on Shape C; CEO + Director on Phase-1) DO ship as `.cursor/agents/*.md` via `generateAgents()` — they are the editor-side front doors for product-level + SDLC work, and are rendered from a shared source under `agents/shared/chiefs/`. Local-only — these packages are workspace siblings and are NEVER published to npm.',
};

// Shared protocols that are OpenCode-tier-specific and should NOT emit a
// Cursor rule. Everything else under agents/shared/ emits a rule with an
// `@file` pointer to the canonical source.
export const SHARED_RULE_SKIPS = new Set([
  // All three only exist to shore up small / 32k local models — Cursor's
  // frontier models don't exhibit the failure modes these patch (design
  // report §6, bullet 3 and §8-q5).
  'LOCAL_LLM_PRIMER.md',
  'MODEL_ADAPTER.md',
  'CONTEXT_BUDGET.md',
  // 4-executor matrix (A/B/C/D) collapses to Task+inline on Cursor; the
  // raw document would mislead (design report §5, bullet 2 and §6).
  'EXECUTOR_SELECTION.md',
]);

// Skills that are *persona wrappers* ("Load and follow the instructions
// in the <agent> agent") — orchestrator-first architecture means these
// now ship as BDK agents in the workspace sibling attest-experts and are
// invoked via the conductor, not as local Cursor slash-commands. Keeping
// them here would show the user a /security that cannot route anywhere.
//
// Classification rule used to populate this set: the skill body contains
// the phrase "Load and follow the instructions in" (persona wrapper), OR
// the skill is a known orchestrator entry point (autopilot/review) or an
// SDLC-lead sub-step (onboard-*) whose coordinator lives in BDK.
export const PERSONA_SKILL_DROPS = new Set([
  // Persona-wrapper pattern — one line each, body says "Load and follow
  // the instructions in the `<agent>` agent".
  'a11y',
  'analytics',
  'api-design',
  'architect',
  'challenge',
  'code',
  'containers',
  'cost',
  'data-governance',
  'dba',
  'design-iterate',
  'devops',
  'documentation-gap-finder',
  'end-user-simulator',
  'frontend',
  'gauntlet',
  'git',
  'guide',
  'llm-integration',
  'migration-planner',
  'perf',
  'release',
  'reliability',
  'research',
  'review-code',
  'sdlc',
  'security',
  'test-expert',
  'ux',
  // Orchestration entry points — autopilot IS the conductor; review
  // coordinates three personas. Both live in BDK (the workspace sibling
  // `attest-conductor`); the Cursor-side replacement is
  // `invoke-attest-conductor`.
  'autopilot',
  'review',
  // sdlc-lead sub-steps — the coordinator (`agents/sdlc-lead.md`) that
  // owns the deep-onboard flow ships as a BDK agent; its sub-steps go
  // with it. A standalone `/onboard-verify` from Cursor cannot thread
  // state back into the parent flow and would be misleading.
  'onboard-gap-fill',
  'onboard-inventory',
  'onboard-verify',
  // ui-verify is a persona in disguise — frontmatter carries
  // `agent: ui-verifier`, meaning on OpenCode the skill *invokes* the
  // ui-verifier agent. Same reason to drop as the persona wrappers.
  'ui-verify',
  // user-guide: SKILL.md's own description says "Placeholder skill
  // front door — T21.2 scope only"; dropping is the honest port.
  'user-guide',
  // steward: project-intelligence persona ("audits CLAUDE.md / AGENTS.md
  // alignment with actual codebase, captures session learnings"). Persona.
  'steward',
]);

// Skills that are genuine techniques/procedures (not persona wrappers)
// — these KEEP as Cursor skills. The set is derived not asserted: every
// skill not in PERSONA_SKILL_DROPS is expected to be here. The parity
// check below enforces the invariant.
export const TECHNIQUE_SKILL_KEEPS = new Set([
  'api-ground',       // version-pinned reference from installed package
  'design-options',   // generate 2-3 alternative approaches
  'explore',          // trace a feature end-to-end
  'game-asset-pipeline', // deterministic pixel-art post-process scripts
  'gate',             // wraps validate-phase-gate.sh
  'goal',             // bounded objective loop
  'pre-code',         // pre-flight checklist before writing code
  'reflow',           // recompute module-ticket graph claimable set
  'simplify',         // quick scoped review of recent changes
  'vault',            // query/ingest the agent-brain-vault
  'wave',             // Level-2 wave integration gate
]);

// Judgment-call ambiguity log — printed in verbose mode and reproduced in
// internal/build-target-cursor.md. Each entry pairs skill → one-sentence
// rationale for the DROP/KEEP call. Reviewers who disagree can move an
// entry between PERSONA_SKILL_DROPS and TECHNIQUE_SKILL_KEEPS; the
// parity check will fail-fast if the set partition breaks.
export const SKILL_AMBIGUITY_NOTES = {
  'gauntlet':
    "Dropped: skill body says 'Load and follow the instructions in the gauntlet-lead agent' — persona wrapper, even though the DESCRIPTION reads like a technique loop.",
  'design-iterate':
    "Dropped: skill body says 'Load and follow the instructions in the design-iterator agent' — persona wrapper, same shape as /ux and /frontend.",
  'reflow':
    "Kept: attest-internal plan.json bookkeeping, but genuinely a technique ('recompute status, show claimable modules'). The conductor also uses this logic internally.",
  'wave':
    "Kept: attest-internal 'Level-2 wave integration gate' — but the gate itself is a technique (compose reviewer set, run concurrently, synthesize report), not a persona.",
  'autopilot':
    "Dropped: this IS the conductor outer loop. Replaced by `invoke-attest-conductor` which teaches the local agent to call the workspace sibling `attest-conductor`.",
  'vault':
    "Kept: depends on an external agent-brain-vault store the user may not have, but it's a self-describing technique (query/ingest/lint) rather than a persona.",
  'guide':
    "Dropped: 'Expert-system concierge / front door' routes between personas. With personas in BDK, the local-editor routing collapses into `invoke-attest-conductor` + Cursor's own `/` menu.",
};

// ── TRANSFORMS ──────────────────────────────────────────────────────────
// PROSE runs BEFORE PATHS so dual-runtime sentences collapse cleanly
// instead of becoming "Cursor or Cursor". Mirrors the ordering in
// build-target-claude.mjs.
const PROSE = [
  // Tool-name rewrites (opencode → Cursor) — only when it clearly refers
  // to the IDE/runtime, not generic prose.
  ['Open a new OpenCode conversation and paste this EXACT prompt',
   'Open a new Cursor conversation and paste this EXACT prompt (or use the Task tool)'],
  ['OpenCode sessions', 'Cursor sessions'],
  ['new OpenCode session', 'new Cursor session'],
  ['OpenCode session', 'Cursor session'],
  ['opencode session', 'Cursor session'],
  ['the `opencode` CLI', 'the Cursor Agent'],
  ['opencode run --agent', 'Task tool (Cursor native) — fallback: /in-cloud'],
  ['opencode run', 'the Cursor Agent'],
  // Dual-runtime path hints — same pattern the Claude target rewrites.
  ['prefix with `~/.config/opencode/` (opencode) or `~/.claude/` (Claude Code) and use the absolute path',
   'use the repo-relative path (the canonical source is this repo)'],
  ["**Use the absolute path:** `~/.config/opencode/agents/shared/X.md` (opencode) or `~/.claude/agents/shared/X.md` (Claude Code). If you're not sure which, list both directories first via `ls`.",
   '**Use the repo-relative path:** `agents/shared/X.md` (the canonical source committed in this repo). Cursor rules under `.cursor/rules/shared-*.mdc` reference these via `@file`.'],
  // Researcher / tool-config references.
  ['provided by the `playwright-search` MCP server (see `examples/opencode.json`)',
   'provided by the `playwright-search` MCP server (see `.cursor/mcp.json`)'],
  ['The opencode built-in `webfetch` and `websearch` tools are **disabled at the config layer** in this project (see `examples/opencode.json` → `"tools": { "webfetch": false, "websearch": false }`). You cannot call them; attempts return an error.',
   "Cursor's built-in web tools are available; prefer the `playwright-search` MCP tools below for cleaner extraction and dedupe. If the MCP server is unavailable, the built-ins are the fallback."],
  // OWASP methodology install pointers.
  ["Re-run `install.sh` (or `install.sh --project`) from the `attest` repo. The rules are stored in the user's personal OpenCode store",
   'Re-copy the `.semgrep/` tree from the `attest` repo into the audited project. Rules live under `.semgrep/custom-rules/`'],
  ['(inside the OpenCode project, not the audited repo)',
   '(inside the project running the audit, not the audited repo)'],
  ["(or the checklist file wherever OpenCode installs references for your setup)",
   '(or the checklist file wherever references live for your setup)'],
  ['(or wherever OpenCode installs references for your setup)',
   '(or wherever references live for your setup)'],
  ["personal store at `~/.config/opencode/.semgrep/custom-rules/` (global) or `.opencode/.semgrep/custom-rules/` (project install)",
   'repo-local `.semgrep/custom-rules/`'],
  // Dispatch-mechanic prose — collapse the 4-executor matrix.
  ['the `task` tool for `git-expert` only',
   'the Task tool (any eligible subagent)'],
  // Tools that were dropped.
  ['`tools/task.ts`',
   "Cursor's Task tool (replaces attest's `tools/task.ts`)"],
  ['tools/write.ts', 'the standard Edit/Write tools'],
  ['tools/append.ts', 'the standard Edit/Write tools'],
  ['tools/update.ts', 'the standard Edit/Write tools'],
  ['plugins/resume-anchor.ts',
   '(dropped on Cursor — session state is handled by Cursor itself; see .cursor/hooks/inject-state.sh for the local-only equivalent)'],
  ['dist/compact-agents/',
   '(compact variants are not generated for Cursor — frontier models do not need them)'],
  ['scripts/detect-model-context.sh',
   '(tier detection is not generated for Cursor — every selectable model is frontier)'],
];

const PATHS = [
  // Point `~/.config/opencode/` back at the repo root — on Cursor the
  // generated tree lives under `.cursor/` of the repo itself.
  ['~/.config/opencode/agents/', 'agents/'],
  ['~/.config/opencode/scripts/', 'scripts/'],
  ['~/.config/opencode/references/', 'references/'],
  ['~/.config/opencode/exemplars/', 'exemplars/'],
  ['~/.config/opencode/.semgrep/', '.semgrep/'],
  ['~/.config/opencode/', ''],
  ['$HOME/.config/opencode/', ''],
  ['$HOME/.config/opencode', ''],
  ['.opencode/', '.cursor/'],
  ['examples/opencode.json', '.cursor/mcp.json'],
];

export function transform(text) {
  for (const [a, b] of PROSE) text = text.split(a).join(b);
  for (const [a, b] of PATHS) text = text.split(a).join(b);
  return text;
}

// ── FRONTMATTER HELPERS ─────────────────────────────────────────────────
function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { fm: {}, body: text };
  const fm = {};
  for (const line of m[1].split('\n')) {
    if (/^\s/.test(line)) continue;
    const kv = line.match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (kv) {
      let v = kv[2].trim();
      if (v.startsWith('"') && v.endsWith('"')) {
        v = v.slice(1, -1);
      } else if (v.startsWith("'") && v.endsWith("'")) {
        // YAML single-quoted strings escape `'` as `''`; collapse back
        // so re-emission via yamlString() doesn't double-escape.
        v = v.slice(1, -1).replace(/''/g, "'");
      }
      fm[kv[1]] = v;
    }
  }
  return { fm, body: text.slice(m[0].length) };
}

function kebab(s) {
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function* walk(dir, ext) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p, ext);
    else if (ext ? p.endsWith(ext) : true) yield p;
  }
}

function yamlString(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

function cleanDescription(desc) {
  if (!desc) return '';
  const d = String(desc).trim();
  if (/^Reference document — read on demand, not an agent\.?$/i.test(d)) return '';
  return d;
}

// ── GENERATORS ──────────────────────────────────────────────────────────

// RULES: `rules/*.md` (already .mdc-shaped) + top-level
// `agents/shared/*.md` protocols as on-demand rules with `@file`
// pointers back to the canonical source. These attach to the local
// Cursor agent for editor-time guidance even though the personas now
// live in BDK (quality protocols like CHALLENGER / FIX_VERIFY /
// GATE_SCORING are universally useful at the IDE layer).
function generateRules() {
  const out = new Map();

  // (1) Direct rules from rules/*.md (skip README).
  for (const abs of walk(join(ROOT, 'rules'), '.md')) {
    const name = basename(abs);
    if (name === 'README.md') continue;
    const text = transform(readFileSync(abs, 'utf8'));
    const dest = `rules/${name.replace(/\.md$/, '.mdc')}`;
    out.set(dest, text);
  }

  // (2) Shared protocols as on-demand rules. Only the TOP-LEVEL files
  // in agents/shared/ — the blocks/ and includes/ subdirs are
  // build-system inputs for scripts/build-agents.mjs.
  const sharedDir = join(ROOT, 'agents/shared');
  const sharedTop = existsSync(sharedDir)
    ? readdirSync(sharedDir)
        .filter((e) => e.endsWith('.md'))
        .map((e) => join(sharedDir, e))
    : [];
  for (const abs of sharedTop) {
    const name = basename(abs);
    if (SHARED_RULE_SKIPS.has(name)) continue;
    const { fm } = parseFrontmatter(readFileSync(abs, 'utf8'));
    const slug = kebab(name.replace(/\.md$/, ''));
    const description =
      cleanDescription(fm.description) ||
      `attest shared protocol: ${slug} — read on demand.`;
    const srcRel = relative(ROOT, abs);
    const body =
      `---\n` +
      `description: ${yamlString(description)}\n` +
      `alwaysApply: false\n` +
      `---\n\n` +
      `# ${slug}\n\n` +
      `This rule points at the attest shared protocol \`${srcRel}\`. ` +
      `Read it when it is relevant to the current task; do not paraphrase from memory.\n\n` +
      `@${srcRel}\n`;
    out.set(`rules/shared-${slug}.mdc`, body);
  }

  return out;
}

// SKILLS: only non-persona skills (TECHNIQUE_SKILL_KEEPS) are emitted,
// plus the hand-authored `invoke-attest-conductor` that teaches the
// local Cursor agent to call out to the sibling BDK conductor.
function generateSkills() {
  const out = new Map();

  // Prominent architecture comment attached to each generated skill as
  // an HTML comment at the top (invisible to the model, visible to the
  // human reader opening the file). Explains why the sibling persona
  // skills are missing.
  const architectureHeader =
    `<!--\n` +
    `  attest-cursor skill — orchestrator-first architecture.\n` +
    `  Expert personas (a11y, analytics, security, sdlc-lead, …) are\n` +
    `  deliberately NOT emitted as .cursor/skills/* on this target —\n` +
    `  they live as BDK agents in the workspace sibling attest-experts\n` +
    `  and are invoked by the workspace sibling attest-conductor. To\n` +
    `  route the local Cursor agent to the conductor, use\n` +
    `  /invoke-attest-conductor. Local-only — these packages are\n` +
    `  workspace siblings and are NEVER published to npm.\n` +
    `  See .cursor/README.md for the full architecture + persona list.\n` +
    `-->\n`;

  const srcDir = join(ROOT, 'skills');
  if (!existsSync(srcDir)) return out;
  for (const e of readdirSync(srcDir)) {
    const skillMd = join(srcDir, e, 'SKILL.md');
    if (!existsSync(skillMd)) continue;
    const name = kebab(e);
    if (PERSONA_SKILL_DROPS.has(name)) continue;
    // Must appear in TECHNIQUE_SKILL_KEEPS or the parity check will flag
    // it — this prevents a newly-added skill from being silently
    // emitted without a classification review.
    if (!TECHNIQUE_SKILL_KEEPS.has(name)) continue;

    const text = readFileSync(skillMd, 'utf8');
    const { fm, body } = parseFrontmatter(text);
    const description = fm.description || `attest skill: ${name}.`;
    const front =
      `---\n` +
      `name: ${name}\n` +
      `description: ${yamlString(description)}\n` +
      `disable-model-invocation: true\n` +
      `---\n`;
    out.set(`skills/${name}/SKILL.md`, front + architectureHeader + transform(body));
  }

  // Hand-authored new skill that teaches the local Cursor agent how to
  // route unattended / multi-expert work to the conductor BDK agent.
  // Lives in-source so the generator stays declarative — if the sibling
  // worker renames the deployed endpoint, change the one path below and
  // rerun `npm run build:cursor`.
  out.set(
    `skills/invoke-attest-conductor/SKILL.md`,
    generateInvokeConductorSkill(),
  );

  // Shape-C editor-side chief skill — teaches the local Cursor agent
  // WHEN to act as sdlc-lead for interactive /sdlc work. Shares its
  // source with the Cursor agents entry; see `generateSdlcLeadAgent()`.
  out.set(
    `skills/sdlc-lead/SKILL.md`,
    generateSdlcLeadSkill(),
  );

  // Phase-1 CEO chief — rendered from the shared source
  // `agents/shared/chiefs/ceo.md`. See generateCeoSkill() for details.
  out.set(`skills/attest-ceo/SKILL.md`, generateCeoSkill());

  return out;
}

// ── SHAPE-C: SDLC-LEAD CHIEF (shared source → skill + agent) ────────────
// Both outputs read `agents/shared/chiefs/sdlc-lead.md` so the chief
// persona lives in exactly one place. The generators only re-frame the
// shared body for Cursor's two surfaces: a skill (how the current agent
// learns to be the chief when the user asks) and a custom-mode / subagent
// (a separately-selectable Cursor agent whose tool allowlist excludes
// raw shell for destructive ops).
function readSdlcLeadSharedSource() {
  const abs = join(ROOT, SDLC_LEAD_SHARED_SOURCE);
  if (!existsSync(abs)) {
    throw new Error(
      `generateSdlcLead*: shared chief source missing at ${SDLC_LEAD_SHARED_SOURCE} ` +
        `— this is the single source for both the skill and the agent output. ` +
        `Create it (see docs/attest-chief-architecture.md §Recommendation).`
    );
  }
  const text = readFileSync(abs, 'utf8');
  const { fm, body } = parseFrontmatter(text);
  return { fm, body: transform(body) };
}

function generateSdlcLeadSkill() {
  const { fm, body } = readSdlcLeadSharedSource();
  const description =
    cleanDescription(fm.description) ||
    'Editor-side SDLC chief for interactive /sdlc work.';
  const front =
    `---\n` +
    `name: sdlc-lead\n` +
    `description: ${yamlString(description)}\n` +
    `disable-model-invocation: true\n` +
    `---\n`;
  const header =
    `<!--\n` +
    `  attest-cursor Shape-C skill — editor-side chief.\n` +
    `  Shared source: ${SDLC_LEAD_SHARED_SOURCE}\n` +
    `  Sibling output: .cursor/agents/sdlc-lead.md (same source, agents\n` +
    `  frontmatter + tool-allowlist tweak).\n` +
    `  Second chief: workspace sibling ${PKG_ATTEST_CONDUCTOR} (hosted BDK,\n` +
    `  /autopilot). Local-only — NOT published to npm.\n` +
    `  See .cursor/README.md and docs/attest-chief-architecture.md.\n` +
    `-->\n\n` +
    `# sdlc-lead (editor-side chief) — skill form\n\n` +
    `This skill teaches the local Cursor Agent to **act as sdlc-lead**\n` +
    `when the user asks about SDLC, phases, routing, gates, or\n` +
    `multi-phase work. The authoritative chief persona follows below —\n` +
    `read it fully on first invocation; the fence/gate/approval rules\n` +
    `are not optional.\n\n` +
    `> Shape-C note: policy enforcement is server-side on every\n` +
    `> \`tools/call\` to attest-mcp. The Cursor-side hooks\n` +
    `> (\`evaluate-shell-policy.sh\`, \`evaluate-write-policy.sh\`)\n` +
    `> are the editor-experience "no" so the user hears the refusal\n` +
    `> before the shell runs; attest-mcp is the authoritative "no".\n\n` +
    `---\n\n`;
  return front + header + body;
}

function generateSdlcLeadAgent() {
  const { fm, body } = readSdlcLeadSharedSource();
  const description =
    cleanDescription(fm.description) ||
    'Editor-side SDLC chief for interactive /sdlc work.';
  // Cursor custom-mode / subagent frontmatter. Tool allowlist includes
  // the attest MCP surface (every tool call runs through the Shape-C
  // policy engine) + the standard read/write/task tools, but excludes
  // raw shell for destructive ops — the agent uses `request_approval`
  // + `invoke_expert` instead. The policy hooks are a belt-and-braces
  // enforcement on top of this.
  //
  // The exact frontmatter schema for `.cursor/agents/*.md` evolves with
  // Cursor's agent-config format; the fields below are the minimal
  // stable set (name/description/tools/model). If Cursor adds schema
  // enforcement, mirror the live format and rerun `npm run build:cursor`.
  const front =
    `---\n` +
    `name: sdlc-lead\n` +
    `description: ${yamlString(description)}\n` +
    `model: inherit\n` +
    `# Shape-C tool allowlist: attest-mcp surface (policy-mediated) +\n` +
    `# standard read/explore/task tools. Raw shell is excluded — the\n` +
    `# chief uses attest.request_approval + attest.invoke_expert for\n` +
    `# any destructive operation. The .cursor/hooks/evaluate-*-policy.sh\n` +
    `# hooks are the editor-side belt-and-braces check.\n` +
    `tools:\n` +
    `  - read\n` +
    `  - grep\n` +
    `  - glob\n` +
    `  - edit\n` +
    `  - write\n` +
    `  - task\n` +
    `  - mcp:attest\n` +
    `  - mcp:attest-conductor\n` +
    `---\n`;
  const header =
    `<!--\n` +
    `  attest-cursor Shape-C agent — editor-side chief.\n` +
    `  Shared source: ${SDLC_LEAD_SHARED_SOURCE}\n` +
    `  Sibling output: .cursor/skills/sdlc-lead/SKILL.md\n` +
    `  Tool allowlist (above) excludes raw bash for destructive ops;\n` +
    `  use attest.${POLICY_TOOL_NAMES.approval} + attest.${POLICY_TOOL_NAMES.invoke} instead.\n` +
    `  See .cursor/README.md and docs/attest-chief-architecture.md.\n` +
    `-->\n\n` +
    `# sdlc-lead — editor-side chief (agent form)\n\n` +
    `This file defines sdlc-lead as a separately-selectable Cursor\n` +
    `agent. Picking it from Cursor's agent dropdown enters this chief\n` +
    `mode directly, with a tool allowlist that routes destructive work\n` +
    `through the attest-mcp policy engine instead of raw shell. The\n` +
    `authoritative chief persona follows:\n\n` +
    `---\n\n`;
  return front + header + body;
}

function generateInvokeConductorSkill() {
  return `---
name: invoke-attest-conductor
description: 'Route a long-running / unattended attest task (autopilot, multi-phase SDLC build, scheduled runs) to the HOSTED conductor BDK agent (workspace sibling attest-conductor). For small SDLC questions ("what phase?", "run the gate", "advance one step") prefer the sdlc-lead skill — do not wake the hosted conductor unless you actually need autopilot. The hosted conductor and sdlc-lead share one policy engine; this skill is specifically the "I need the long-running Ralph loop" door.'
disable-model-invocation: true
---

<!--
  attest-cursor Shape-C skill — hosted-conductor dial-out.
  Two chiefs:
    • sdlc-lead (.cursor/skills/sdlc-lead/SKILL.md + agents/sdlc-lead.md)
      — editor-side chief for interactive /sdlc work.
    • conductor (workspace sibling attest-conductor, served via BDK)
      — hosted BDK chief for /autopilot and GitHub-driven work.
  Pick sdlc-lead for small / interactive asks; this skill for long-running
  unattended work. Local-only — attest-conductor is a workspace sibling
  and is NEVER fetched from npm. See .cursor/README.md for the full
  two-chief design.
-->

# invoke-attest-conductor

The local Cursor Agent is a thin editor-time veneer. Under Shape C it
has **two chiefs** it can wake up:

1. **sdlc-lead** — the editor-side chief
   (\`.cursor/skills/sdlc-lead/SKILL.md\` and
   \`.cursor/agents/sdlc-lead.md\`). The user is at the keyboard, the
   turn is short-lived, the ask fits in one Cursor conversation.
2. **The hosted conductor** — the workspace sibling \`attest-conductor\`
   (served locally via the \`attest-conductor\` MCP entry; the Cursor-
   hosted deploy path is \`npx @cursor/bdk deploy\` from
   \`packages/attest-conductor\`). The user has closed their laptop,
   the ask is multi-phase, or the trigger is GitHub.

**This skill is specifically the hosted-conductor door.** For
interactive SDLC asks, prefer sdlc-lead — do not wake the hosted
conductor unless you actually need autopilot. Both chiefs share the
same \`attest-mcp\` policy engine and the same \`attest-experts\`
fleet, so the governance is unified; the difference is who starts the
turn and whether the loop outlives the current chat.

## When to prefer sdlc-lead instead

If the ask would end in the same chat with the user still watching —
"what phase are we in?", "run the gate", "advance one step", "which
expert owns this?", "review the whole thing" — use the sdlc-lead skill
or switch to the sdlc-lead custom-mode agent. sdlc-lead can \`invoke_expert\`
through attest-mcp for a single expert turn and give you an answer
in-conversation without waking a hosted BDK pod.

## When to invoke the conductor (this skill)

Invoke the conductor whenever the ask is:

- "run /autopilot ..." (any variant),
- "finish the board", "work through all the open tickets",
- "do a full multi-phase build with no further input from me",
- "ship a release and merge it",
- A GitHub-channel trigger (comment, scheduled run) — the conductor
  owns the GitHub front door already.

Natural-language triggers that still belong here (not sdlc-lead):

- "do a full security audit" — multi-expert, long-running.
- "review this change" when "this change" spans dozens of files and
  needs multiple experts.
- Anything that reads like an attest slash command *and* takes long
  enough that the user is closing their laptop.

## How to invoke

Pick the first option that succeeds for the current environment.

### Option 1 — \`attest-conductor\` MCP server (preferred)

\`.cursor/mcp.json\` wires an \`attest-conductor\` server (\`bdk serve\` of
\`packages/attest-conductor\` locally, or an HTTP MCP transport pointing at
the deployed BDK agent in a hosted install). Call its single server tool
\`${CONDUCTOR_TOOL_NAME}\` with the natural-language goal plus any flags:

\`\`\`
attest-conductor.${CONDUCTOR_TOOL_NAME}({
  goal: "<verbatim user ask>",
  iterationCap: <optional: default 6>,
  wallTimeCapMs: <optional: default 15*60_000>,
  consecutiveNoProgressCap: <optional: default 3>,
  maxTurns: <optional: default 10>
})
\`\`\`

Returns the final task record \`{ taskId, stop, task, turns }\` once the
Ralph loop stops (iteration cap, wall-time cap, consecutive-no-progress
cap, agent-decided \`mark_done\`, or agent-decided \`escalate\`). Stream a
short status back to the user while waiting; do NOT attempt to run the
persona's workflow inline.

Alternative chat shape: send \`/autopilot <goal>\` as the message to the
same MCP server's default \`ask\` tool — the conductor's LLM recognizes
the slash prefix and calls \`${CONDUCTOR_TOOL_NAME}\` internally with the
same contract.

### Option 2 — HTTPS endpoint (fallback)

If \`.cursor/mcp.json\` is unreachable (sandbox, offline, hosted install
without the MCP transport), POST directly to the conductor's HTTP channel.
Use \`$ATTEST_CONDUCTOR_URL\` from the user's env (or the hosted URL baked
into the install):

\`\`\`
POST \${ATTEST_CONDUCTOR_URL}/v1/channels/autopilot/run
Content-Type: application/json

{
  "goal": "<verbatim user ask>",
  "iterationCap": <optional>,
  "wallTimeCapMs": <optional>,
  "maxTurns": <optional>
}
\`\`\`

Same response shape as Option 1.

### Option 3 — GitHub comment (fallback)

The conductor also listens on the \`github\` channel for comments that
begin with \`/autopilot …\` on issues, PRs, and review comments. Only use
this path when neither MCP nor HTTPS is reachable AND the user explicitly
wants the run tracked on an issue / PR:

- Pick an existing attest-tracked issue (or ask the user to create one).
- Post a comment via the Cursor Agent's GitHub tooling with the body
  \`/autopilot <verbatim user ask>\` — the conductor's GitHub channel
  (secrets: \`GITHUB_WEBHOOK_SECRET\`, \`GITHUB_APP_ID\`,
  \`GITHUB_APP_PRIVATE_KEY\`) picks it up.
- The conductor replies on the same thread with run status + taskId.

## Why two chiefs instead of one?

See \`.cursor/README.md\` and \`docs/attest-chief-architecture.md\`
§Recommendation. Short version: the hosted conductor is right for
unattended multi-phase work (the Ralph loop outlives the chat), the
editor-side sdlc-lead is right for the interactive /sdlc flow (the user
is at the keyboard and wants the answer in-conversation). Both chiefs
share one policy engine and one experts fleet, so the governance is
unified — the only difference is who starts the turn.
`;
}

// AGENTS: `.cursor/agents/*.md`. Deliberately narrow surface: this
// generator ONLY emits chiefs — the full expert fleet still lives in
// `attest-experts` (workspace sibling) and is reached through the
// conductor. Shape-C emits `sdlc-lead` (editor-side SDLC chief);
// Phase-1 adds `attest-ceo` (and `attest-director` lands on PR #17).
// The generators are additive and do not share state.
//
// HOOKS context (preserved from Shape C):
// Two layers:
//   • Baseline (pre-Shape-C): dangerous-bash blocker, credential-write
//     blocker, afterFileEdit lint/typecheck/secret-scan, postToolUse
//     telemetry, sessionStart STATE.md injection (LOCAL-ONLY — Cursor
//     cloud agents do not fire sessionStart), stop phase-gate.
//   • Shape-C policy integration (additive): evaluate-shell-policy
//     before every shell call, evaluate-write-policy before every file
//     mutation. Both delegate to attest-mcp's policy engine; both are
//     additive to the hard-coded blockers so a deny from either stops
//     the op. See docs/attest-chief-architecture.md §Fences inventory.
//
// `beforeMcpInvoke` would mirror the server-side `tools/call` check
// client-side so the user hears "no" without the server round-trip.
// Cursor's current hook surface
// (https://cursor.com/docs/agent/hooks) does not expose that hook as of
// this generator's write; skipped with the reason inlined in hooks.json
// as `_shape_c_note`. Reintroduce when Cursor exposes `beforeMcpInvoke`.
function generateAgents() {
  const out = new Map();
  out.set('agents/sdlc-lead.md', generateSdlcLeadAgent());
  out.set('agents/attest-ceo.md', generateCeoAgent());
  return out;
}

// Shared chief source loader + CEO skill/agent generators. Pattern is
// a parallel to Shape-C's generateSdlcLead*: one shared source
// (`agents/shared/chiefs/ceo.md`) feeds both the skill (how the local
// Cursor Agent learns to BE the CEO when the user asks) and the agent
// (a separately-selectable Cursor custom-mode / subagent whose tool
// allowlist excludes raw shell / direct repo writes — everything
// mutating goes through the CEO's own MCP server + dispatch).
function readCeoSharedSource() {
  const abs = join(ROOT, CEO_SHARED_SOURCE);
  if (!existsSync(abs)) {
    throw new Error(
      `generateCeo*: shared chief source missing at ${CEO_SHARED_SOURCE} ` +
        `— this is the single source for both the skill and the agent output. ` +
        `Create it (see /cursor/stores/.../docs/attest-ceo-architecture.md).`,
    );
  }
  const text = readFileSync(abs, 'utf8');
  const { fm, body } = parseFrontmatter(text);
  return { fm, body: transform(body) };
}

function generateCeoSkill() {
  const { fm, body } = readCeoSharedSource();
  const description =
    cleanDescription(fm.description) ||
    'Product-level attest CEO — roadmap, ingestion, intent extraction, plan drafting with approval round-trip, dispatch to the conductor.';
  const front =
    `---\n` +
    `name: attest-ceo\n` +
    `description: ${yamlString(description)}\n` +
    `disable-model-invocation: true\n` +
    `---\n`;
  const header =
    `<!--\n` +
    `  attest-cursor skill — editor-side form of the CEO chief.\n` +
    `  Shared source: ${CEO_SHARED_SOURCE}\n` +
    `  Sibling output: .cursor/agents/attest-ceo.md (same source, agents\n` +
    `  frontmatter + tool-allowlist tweak).\n` +
    `  Three chiefs: attest-ceo (this file), sdlc-lead (editor SDLC),\n` +
    `  attest-conductor (hosted autopilot).\n` +
    `  See .cursor/README.md and packages/attest-ceo/README.md.\n` +
    `-->\n\n` +
    `# attest-ceo (editor-side) — skill form\n\n` +
    `This skill teaches the local Cursor Agent to **act as the attest\n` +
    `CEO** when the user types a \`/ceo\` command or any natural-language\n` +
    `variation of one. The authoritative chief persona follows below —\n` +
    `read it fully on first invocation; the autonomy modes, the\n` +
    `three-connection stub plumbing, and the "never bypass the\n` +
    `conductor" rule are not optional.\n\n` +
    `> Phase 1 note: the CEO ingests from Cursor chat only — paste\n` +
    `> Slack / Linear / GitHub / meeting-notes text into chat and the\n` +
    `> CEO extracts intents. Native webhook ingestion is Phase 2.\n\n` +
    `---\n\n`;
  return front + header + body;
}

function generateCeoAgent() {
  const { fm, body } = readCeoSharedSource();
  const description =
    cleanDescription(fm.description) ||
    'Product-level attest CEO — roadmap, ingestion, intent extraction, plan drafting with approval round-trip, dispatch to the conductor.';
  // Cursor custom-mode / subagent frontmatter. Tool allowlist includes
  // the three CEO MCP connections (ceo / conductor / attest) plus the
  // standard read/edit/task tools, but excludes raw shell — the CEO's
  // mutations go through the CEO's own MCP server (`attest-ceo-mcp`),
  // and dispatch runs through the conductor (`attest-conductor`).
  // Repo writes happen inside the conductor's turn, never here.
  //
  // The exact frontmatter schema for `.cursor/agents/*.md` evolves with
  // Cursor's agent-config format; the fields below are the minimal
  // stable set (name/description/model/tools). If Cursor adds schema
  // enforcement, mirror the live format and rerun `npm run build:cursor`.
  const front =
    `---\n` +
    `name: attest-ceo\n` +
    `description: ${yamlString(description)}\n` +
    `model: inherit\n` +
    `# CEO tool allowlist: three attest MCP surfaces (own MCP + conductor\n` +
    `# dispatch + attest-mcp reconciliation) plus standard read/explore\n` +
    `# tools. Raw shell is excluded — the CEO never writes to repos. All\n` +
    `# mutations route through attest-ceo-mcp (${CEO_MCP_TOOL_NAMES.ingest},\n` +
    `# ${CEO_MCP_TOOL_NAMES.draft}, ${CEO_MCP_TOOL_NAMES.approve}, ...)\n` +
    `# and dispatch goes through attest-conductor.${CONDUCTOR_TOOL_NAME}.\n` +
    `tools:\n` +
    `  - read\n` +
    `  - grep\n` +
    `  - glob\n` +
    `  - task\n` +
    `  - mcp:attest-ceo-mcp\n` +
    `  - mcp:attest-conductor\n` +
    `  - mcp:attest\n` +
    `---\n`;
  const header =
    `<!--\n` +
    `  attest-cursor agent — editor-side form of the CEO chief.\n` +
    `  Shared source: ${CEO_SHARED_SOURCE}\n` +
    `  Sibling output: .cursor/skills/attest-ceo/SKILL.md\n` +
    `  Tool allowlist (above) excludes raw bash. Mutations go through\n` +
    `  attest-ceo-mcp (owner of ${CEO_MCP_TOOL_NAMES.ingest} /\n` +
    `  ${CEO_MCP_TOOL_NAMES.draft} / ${CEO_MCP_TOOL_NAMES.approve} / ...),\n` +
    `  dispatch goes through attest-conductor.${CONDUCTOR_TOOL_NAME}.\n` +
    `  See .cursor/README.md and packages/attest-ceo/README.md.\n` +
    `-->\n\n` +
    `# attest-ceo — editor-side CEO chief (agent form)\n\n` +
    `This file defines the attest CEO as a separately-selectable Cursor\n` +
    `agent. Picking it from Cursor's agent dropdown enters CEO mode\n` +
    `directly, with a tool allowlist that routes every mutation through\n` +
    `the CEO's own MCP server and every dispatch through the conductor.\n` +
    `The authoritative chief persona follows:\n\n` +
    `---\n\n`;
  return front + header + body;
}

// Passthrough reader for hand-authored `.cursor/<rel>` files that have no
// generator yet. The canonical source IS the composed `.cursor/<rel>` tree
// on `release/v0.1.0`, so we always read from `${ROOT}/.cursor/<rel>`
// (NOT from OUT — OUT may point at an empty temp dir when
// `scripts/check-target-parity.mjs` regenerates both targets for its
// smoke test). If the canonical source file is missing we throw, so a
// stray `--write` can't silently drop it; `--check` against the
// committed tree still catches drift because the content read here is
// bit-identical to what the committed tree already holds.
const SOURCE_MANUAL_ROOT = join(ROOT, '.cursor');
function passthroughManual(relPaths) {
  const out = new Map();
  for (const rel of relPaths) {
    const abs = join(SOURCE_MANUAL_ROOT, rel);
    if (!existsSync(abs)) {
      throw new Error(
        `passthroughManual: expected hand-authored ${rel} at ${abs} but ` +
          `it is missing. See scripts/build-target-cursor.mjs comment.`,
      );
    }
    out.set(rel, readFileSync(abs, 'utf8'));
  }
  return out;
}

function generateHooks() {
  const out = new Map();
  const hooksJson = {
    version: 1,
    _note:
      'sessionStart (inject-state.sh) is LOCAL-ONLY; Cursor cloud agents do not run sessionStart (per https://cursor.com/docs/agent/hooks). All other hooks run in cloud and local.',
    _shape_c_note:
      'Shape-C policy hooks (evaluate-*-policy.sh) delegate to the attest-mcp policy engine. Mode is controlled by `' +
      POLICY_MODE_ENV +
      '` (ENFORCE | LOG_ONLY | OFF — default LOG_ONLY, flip to ENFORCE once policies land). `beforeMcpInvoke` is NOT wired: Cursor does not currently expose that hook (per https://cursor.com/docs/agent/hooks); the server-side `tools/call` check in attest-mcp remains the authoritative chokepoint. Reintroduce when Cursor adds the hook.',
    _shape_c_contract:
      'Policy tool names (keep in sync with the workspace sibling ' +
      PKG_ATTEST_MCP +
      '): ' +
      JSON.stringify(POLICY_TOOL_NAMES),
    hooks: {
      beforeShellExecution: [
        { command: '.cursor/hooks/block-dangerous.sh' },
        { command: '.cursor/hooks/evaluate-shell-policy.sh' },
      ],
      preToolUse: [
        { command: '.cursor/hooks/block-credentials.sh', matcher: 'Write' },
        { command: '.cursor/hooks/block-credentials.sh', matcher: 'Edit' },
        { command: '.cursor/hooks/evaluate-write-policy.sh', matcher: 'Write' },
        { command: '.cursor/hooks/evaluate-write-policy.sh', matcher: 'Edit' },
      ],
      afterFileEdit: [{ command: '.cursor/hooks/post-edit-check.sh' }],
      postToolUse: [{ command: '.cursor/hooks/telemetry.sh' }],
      sessionStart: [{ command: '.cursor/hooks/inject-state.sh' }],
      stop: [{ command: '.cursor/hooks/end-of-turn-gate.sh' }],
    },
  };
  out.set('hooks.json', JSON.stringify(hooksJson, null, 2) + '\n');

  for (const [name, content] of Object.entries(HOOK_SCRIPTS)) {
    out.set(`hooks/${name}`, content);
  }
  for (const [name, content] of Object.entries(SHAPE_C_HOOK_SCRIPTS)) {
    out.set(`hooks/${name}`, content);
  }
  return out;
}

const HOOK_SCRIPTS = {
  'block-dangerous.sh':
`#!/usr/bin/env bash
# beforeShellExecution — block destructive bash commands (verbatim port
# of plugins/expert-hooks.ts DANGEROUS_BASH). Cursor contract: read JSON
# from stdin, write {"permission":"allow"|"deny",...} to stdout.
set -eu
input=$(cat)
cmd=$(printf '%s' "$input" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("command",""))' 2>/dev/null || echo "")

deny() {
  reason="$1"
  cat <<EOF
{"continue":true,"permission":"deny","user_message":"BLOCKED: $reason","agent_message":"BLOCKED by attest hook: $reason. If you truly need this, ask the user to run it manually outside Cursor."}
EOF
  exit 0
}

if printf '%s' "$cmd" | grep -Eqi 'rm\\s+(-[a-z]*r[a-z]*f|--recursive[[:space:]]+.*--force|-[a-z]*f[a-z]*r)\\s+/\\s*$|rm\\s+-rf\\s+/\\s*$'; then
  deny "rm -rf / — would delete the entire filesystem"
fi
if printf '%s' "$cmd" | grep -Eqi '\\bDROP[[:space:]]+TABLE\\b'; then
  deny "DROP TABLE — destructive database operation"
fi
if printf '%s' "$cmd" | grep -Eqi '\\bDELETE[[:space:]]+FROM[[:space:]]+[^[:space:]]+[[:space:]]*(;|$)'; then
  if ! printf '%s' "$cmd" | grep -Eqi '\\bWHERE\\b'; then
    deny "DELETE FROM without WHERE — would delete all rows"
  fi
fi
if printf '%s' "$cmd" | grep -Eqi '\\bgit[[:space:]]+push[[:space:]]+.*--force\\b|\\bgit[[:space:]]+push[[:space:]]+-f\\b'; then
  deny "git push --force — would rewrite remote history"
fi
if printf '%s' "$cmd" | grep -Eqi '\\bgit[[:space:]]+reset[[:space:]]+--hard\\b'; then
  deny "git reset --hard — would discard uncommitted work"
fi
if printf '%s' "$cmd" | grep -Eqi '\\bnpm[[:space:]]+publish\\b'; then
  deny "attempted public-registry upload is blocked by local-only policy (never fetched or pushed to the registry)"
fi
if printf '%s' "$cmd" | grep -Eqi '\\bcurl[[:space:]]+.*\\|[[:space:]]*bash\\b|\\bwget[[:space:]]+.*\\|[[:space:]]*bash\\b'; then
  deny "curl|bash / wget|bash — executing untrusted remote code"
fi

echo '{"continue":true,"permission":"allow"}'
`,

  'block-credentials.sh':
`#!/usr/bin/env bash
# preToolUse (matcher: Write|Edit) — block writes to credential files
# (verbatim port of plugins/expert-hooks.ts BLOCKED_FILE_PATTERNS).
set -eu
input=$(cat)
path=$(printf '%s' "$input" | python3 -c '
import json,sys
d=json.load(sys.stdin)
ti=d.get("tool_input",{}) or {}
print(ti.get("file_path") or ti.get("filePath") or ti.get("path") or "")
' 2>/dev/null || echo "")

deny() {
  reason="$1"
  cat <<EOF
{"permission":"deny","user_message":"BLOCKED: writing to $reason is not allowed","agent_message":"BLOCKED by attest hook: writing to $reason is not allowed. Use environment variables, a secrets manager, or have the user place the file manually."}
EOF
  exit 0
}

if [ -z "$path" ]; then
  echo '{"permission":"allow"}'
  exit 0
fi

base=$(basename "$path")
case "$base" in
  .env|.env.*)
    deny ".env file — use environment variables or a secrets manager"
    ;;
  credentials.json|secrets.json)
    deny "credentials/secrets file"
    ;;
  id_rsa|id_ed25519|id_ecdsa|id_dsa)
    deny "SSH private key"
    ;;
esac

case "$path" in
  *.key|*.pem|*.p12|*.pfx)
    deny "private-key file"
    ;;
esac

echo '{"permission":"allow"}'
`,

  'post-edit-check.sh':
`#!/usr/bin/env bash
# afterFileEdit — format/lint/typecheck/secret-scan the edited file.
# Verbatim port of plugins/expert-hooks.ts tool.execute.after. Fail-open
# on every step: a missing tool is silent, every scanner failure is a
# warning that goes into additional_context so the agent can see it.
set -u
input=$(cat)

# Honor the global disable env the attest plugin uses.
if [ "\${EXPERTS_TELEMETRY:-}" = "0" ] && [ "\${ATTEST_POST_EDIT:-1}" = "0" ]; then
  echo '{}'
  exit 0
fi

path=$(printf '%s' "$input" | python3 -c '
import json,sys
d=json.load(sys.stdin)
print(d.get("file_path",""))
' 2>/dev/null || echo "")

if [ -z "$path" ] || [ ! -f "$path" ]; then
  echo '{}'
  exit 0
fi

ext=".\${path##*.}"
case "$ext" in
  .png|.jpg|.jpeg|.gif|.ico|.svg|.webp|.woff|.woff2|.ttf|.eot|.zip|.tar|.gz|.bz2|.lock|.pyc|.pyo|.so|.dylib|.dll)
    echo '{}'
    exit 0
    ;;
esac

warnings=""
run() { "$@" >/dev/null 2>&1 || true; }

case "$ext" in
  .ts|.tsx|.js|.jsx|.json|.md|.css|.html)
    run prettier --write "$path"
    ;;
  .py)
    run black "$path"
    run isort "$path"
    ;;
  .go)
    run gofmt -w "$path"
    ;;
  .rs)
    run rustfmt "$path"
    ;;
esac

case "$ext" in
  .ts|.tsx|.js|.jsx)
    if command -v eslint >/dev/null 2>&1; then
      out=$(eslint "$path" --max-warnings 0 2>&1 | head -c 2000 || true)
      [ -n "$out" ] && warnings="\${warnings}[lint] \${path}\\n\${out}\\n"
    fi
    ;;
  .py)
    if command -v ruff >/dev/null 2>&1; then
      out=$(ruff check "$path" 2>&1 | head -c 2000 || true)
      [ -n "$out" ] && warnings="\${warnings}[lint] \${path}\\n\${out}\\n"
    fi
    ;;
esac

case "$ext" in
  .ts|.tsx)
    if command -v tsc >/dev/null 2>&1; then
      out=$(tsc --noEmit --pretty false "$path" 2>&1 | head -c 2000 || true)
      [ -n "$out" ] && warnings="\${warnings}[tsc] \${path}\\n\${out}\\n"
    fi
    ;;
esac

# Secret scan — grep the file for the SECRET_PATTERNS registered in
# plugins/expert-hooks.ts.
scan=$(grep -nE \\
  -e 'AKIA[0-9A-Z]{16}' \\
  -e 'BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY' \\
  -e '(api[_-]?key|apikey|api[_-]?secret)[[:space:]]*[:=][[:space:]]*["'"'"'][A-Za-z0-9_-]{16,}["'"'"']' \\
  -e '(bearer|token|auth[_-]?token|access[_-]?token)[[:space:]]*[:=][[:space:]]*["'"'"'][A-Za-z0-9_./+=-]{20,}["'"'"']' \\
  -e '(postgres|mysql|mongodb|redis|amqp)(ql)?://[^:]+:[^@]+@' \\
  "$path" 2>/dev/null | head -c 2000 || true)
if [ -n "$scan" ]; then
  warnings="\${warnings}[secret-scan] \${path} — possible secrets found:\\n\${scan}\\nMove these to environment variables or a secrets manager.\\n"
fi

if [ -n "$warnings" ]; then
  python3 - <<PY
import json
print(json.dumps({"additional_context": """\${warnings}"""}))
PY
else
  echo '{}'
fi
`,

  'telemetry.sh':
`#!/usr/bin/env bash
# postToolUse — append one JSONL row of tool-call actuals to
# docs/work/telemetry.jsonl (counts/identifiers only, never content).
# Disable: EXPERTS_TELEMETRY=0. Mirrors plugins/expert-hooks.ts
# telemetry writer.
set -u
if [ "\${EXPERTS_TELEMETRY:-}" = "0" ]; then
  echo '{}'
  exit 0
fi
input=$(cat)
ts=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
dir="docs/work"
mkdir -p "$dir" 2>/dev/null || true
python3 - "$input" "$ts" <<'PY' >> "$dir/telemetry.jsonl" 2>/dev/null || true
import json, sys
raw, ts = sys.argv[1], sys.argv[2]
try:
    d = json.loads(raw)
except Exception:
    sys.exit(0)
row = {
  "ts": ts,
  "source": "cursor-hook",
  "tool": d.get("tool_name"),
  "duration_ms": d.get("duration"),
  "model": d.get("model") or d.get("model_id"),
  "cwd": d.get("cwd"),
}
print(json.dumps(row))
PY
echo '{}'
`,

  'inject-state.sh':
`#!/usr/bin/env bash
# sessionStart — LOCAL ONLY (cloud agents do not fire sessionStart per
# Cursor docs). If docs/work/STATE.md exists, inject it as
# additional_context so the agent resumes with the last checkpoint. The
# small, cheap replacement for OpenCode's resume-anchor plugin (design
# report §6 "Hooks layer").
set -u
cat >/dev/null
if [ -f "docs/work/STATE.md" ]; then
  python3 - <<'PY'
import json
with open("docs/work/STATE.md","r",encoding="utf-8",errors="replace") as f:
    content = f.read()
print(json.dumps({"additional_context": "attest resume state (docs/work/STATE.md):\\n\\n" + content}))
PY
else
  echo '{}'
fi
`,

  'end-of-turn-gate.sh':
`#!/usr/bin/env bash
# stop — if a phase gate script is present, run it and surface the
# unresolved gaps as a followup_message. Keeps the agent from stopping
# before the SDLC phase gate opens, mirroring the
# scripts/validators/run-coverage-loop.sh behavior on OpenCode.
set -u
cat >/dev/null
gate="scripts/validators/validate-phase-gate.sh"
if [ ! -x "$gate" ]; then
  echo '{}'
  exit 0
fi

phase_file="docs/work/.current-phase"
if [ ! -f "$phase_file" ]; then
  echo '{}'
  exit 0
fi
phase=$(cat "$phase_file" 2>/dev/null | tr -d '[:space:]')
if [ -z "$phase" ]; then
  echo '{}'
  exit 0
fi

out=$("$gate" "$phase" 2>&1 | head -c 4000 || true)
code=\${PIPESTATUS[0]:-0}
if [ "$code" = "0" ]; then
  echo '{}'
else
  python3 - "$out" "$phase" <<'PY'
import json, sys
out, phase = sys.argv[1], sys.argv[2]
msg = f"[attest end-of-turn gate] phase {phase} is NOT clean. Fix the gaps and continue:\\n\\n{out}"
print(json.dumps({"followup_message": msg}))
PY
fi
`,
};

// Shape-C policy hooks — delegate to attest-mcp's policy engine via
// LOCAL-WORKSPACE binaries only. Never shells out to the registry via
// `npx`'s auto-install flag or any other mechanism.
//
// Shape (identical across both hooks):
//   1. Read Cursor hook JSON from stdin.
//   2. Branch on $ATTEST_POLICY_MODE: OFF → allow; ENFORCE/LOG_ONLY →
//      call policy engine.
//   3. Walk the local-only invocation chain:
//        a. `attest-mcp-policy evaluate --kind=<kind>` (dedicated bin)
//        b. `attest-mcp policy --kind=<kind>` (main CLI subcommand)
//        c. HARD FAIL — crisp error, no registry fallback.
//   4. On engine success: pass the decision JSON through verbatim.
//   5. On engine error:
//        LOG_ONLY → allow + user_message naming the install step
//        ENFORCE  → deny + user_message naming the install step
//
// HARD CONSTRAINT: the hooks never shell out to `npx` with the auto-
// install flag, never pass `--package=…`, never fetch from the npm
// registry under any flag. attest-mcp is a workspace sibling
// (packages/attest-mcp) and resolves locally via
// `./node_modules/.bin/attest-mcp*` after `npm install` at the repo
// root. See docs/attest-chief-architecture.md §Fences inventory for
// why client-side + server-side enforcement both matter in Shape C.
const SHAPE_C_HOOK_SCRIPTS = {
  'evaluate-shell-policy.sh': buildPolicyHookScript({
    kind: 'shell',
    hookName: 'beforeShellExecution',
    permissionShape: 'shell',
    description:
      'Shape-C policy evaluator for shell commands. Delegates to attest-mcp.' +
      POLICY_TOOL_NAMES.shell +
      ' via local workspace bin. Additive to block-dangerous.sh — a deny from either stops the shell call.',
  }),
  'evaluate-write-policy.sh': buildPolicyHookScript({
    kind: 'write',
    hookName: 'preToolUse (matcher: Write|Edit)',
    permissionShape: 'write',
    description:
      'Shape-C policy evaluator for file-mutating tool calls. Delegates to attest-mcp.' +
      POLICY_TOOL_NAMES.write +
      ' via local workspace bin. Additive to block-credentials.sh — a deny from either stops the write.',
  }),
};

function buildPolicyHookScript({ kind, hookName, permissionShape, description }) {
  const envDoc =
    `# ${POLICY_MODE_ENV}=${POLICY_MODES.join('|')} (default: LOG_ONLY)\n` +
    `#   ENFORCE  — fail-closed on engine error or deny.\n` +
    `#   LOG_ONLY — log + allow on engine error (dev / policy authoring).\n` +
    `#   OFF      — skip the policy call entirely (local escape hatch).`;
  const engineBinDoc =
    `# Local-only invocation chain (NEVER touches npm registry):\n` +
    `#   1. ${POLICY_CLI_PRIMARY} evaluate --kind=${kind}\n` +
    `#      — dedicated bin from attest-mcp's \`bin\` field; resolves via\n` +
    `#        ./node_modules/.bin/ after \`npm install\` at repo root.\n` +
    `#   2. ${POLICY_CLI_SECONDARY} policy --kind=${kind}\n` +
    `#      — main attest-mcp CLI's \`policy\` subcommand (compat path).\n` +
    `#   3. HARD FAIL — the hook never shells out to \`npx\` with the\n` +
    `#      auto-install flag, never passes \`--package=…\`, never\n` +
    `#      fetches from the npm registry under any flag. attest-mcp is\n` +
    `#      a workspace sibling (packages/${PKG_ATTEST_MCP}/), NOT a\n` +
    `#      published package.\n` +
    `# Contract: reads Cursor hook JSON on stdin, writes a Cursor hook\n` +
    `#           decision JSON on stdout; non-zero exit = engine error.`;
  // Shell hooks carry a `continue:true` field; preToolUse (Write/Edit)
  // hooks do not — mirror the existing block-dangerous.sh (shell) and
  // block-credentials.sh (write) shapes exactly so the policy hooks are
  // drop-in with the baseline blockers.
  const continueField = permissionShape === 'shell' ? `"continue":true,` : ``;
  const allowJson = `{${continueField}"permission":"allow"}`;
  const allowWithMsgJson = (msg) =>
    `{${continueField}"permission":"allow","user_message":"${msg}"}`;
  const denyFn =
    `deny() {\n  reason="$1"\n  cat <<EOF\n` +
    `{${continueField}"permission":"deny","user_message":"BLOCKED by attest Shape-C policy ($reason)","agent_message":"attest-mcp.${POLICY_TOOL_NAMES[kind]} denied this ${kind} operation: $reason"}\n` +
    `EOF\n  exit 0\n}`;
  const installHint = LOCAL_INSTALL_HINT;
  const engineUnreachableMsg =
    `attest-mcp policy engine not reachable locally. Neither \\\`${POLICY_CLI_PRIMARY}\\\` nor \\\`${POLICY_CLI_SECONDARY} policy\\\` resolves. attest-mcp is a workspace sibling and MUST be installed locally — do not expect it from the npm registry. Fix: ${installHint} (and \\\`npm --workspace packages/${PKG_ATTEST_MCP} run build\\\` to produce the dist/ output the bin points at).`;
  return `#!/usr/bin/env bash
# ${hookName} — Shape-C policy hook (kind=${kind}).
#
# ${description}
#
${envDoc}
#
${engineBinDoc}
set -eu

input=$(cat)
mode="\${${POLICY_MODE_ENV}:-LOG_ONLY}"

case "$mode" in
  OFF)
    echo '${allowJson}'
    exit 0
    ;;
  ENFORCE|LOG_ONLY)
    : # fall through
    ;;
  *)
    # Unknown mode — treat as ENFORCE per fail-closed default.
    mode="ENFORCE"
    ;;
esac

${denyFn}

# Local-only invocation chain. Each resolver only checks local PATH /
# node_modules/.bin; neither reaches the npm registry. The hooks fail
# loudly rather than silently fetching from npm, per the local-only
# hard constraint.
run_engine() {
  if command -v ${POLICY_CLI_PRIMARY} >/dev/null 2>&1; then
    printf '%s' "$input" | ${POLICY_CLI_PRIMARY} evaluate --kind=${kind} 2>/dev/null
    return $?
  fi
  if command -v ${POLICY_CLI_SECONDARY} >/dev/null 2>&1; then
    printf '%s' "$input" | ${POLICY_CLI_SECONDARY} policy --kind=${kind} 2>/dev/null
    return $?
  fi
  # HARD FAIL — the hook never shells out to \`npx\` with the auto-
  # install flag, never passes \`--package=…\`, never fetches from the
  # npm registry under any flag.
  return 127
}

decision=$(run_engine) || rc=$?
rc="\${rc:-0}"

if [ "$rc" -ne 0 ] || [ -z "$decision" ]; then
  if [ "$mode" = "LOG_ONLY" ]; then
    # Engine unavailable — log once (best-effort) and allow through.
    ts=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
    mkdir -p docs/work 2>/dev/null || true
    printf '{"ts":"%s","hook":"evaluate-%s-policy","mode":"LOG_ONLY","engine_rc":%s,"note":"engine unreachable; allowing"}\\n' \\
      "$ts" "${kind}" "$rc" >> docs/work/policy-decisions.jsonl 2>/dev/null || true
    cat <<EOF
${allowWithMsgJson(`[attest Shape-C policy] ${engineUnreachableMsg} LOG_ONLY mode — allowing through.`)}
EOF
    exit 0
  fi
  deny "${engineUnreachableMsg}"
fi

printf '%s\\n' "$decision"
`;
}

// MCP: three servers under Shape C — ALL invoked via LOCAL workspace
// paths. No auto-install `npx` fetch, no registry pull.
//  - `attest`            — the stdio MCP server built out of
//                          packages/attest-mcp/ (77 validators,
//                          phase_gate_check, route_goal, list_experts,
//                          Shape-C policy host — evaluate_* policy tools,
//                          list_fences, request_approval, invoke_expert,
//                          pre_dispatch_check). Invoked as
//                          `node ./packages/attest-mcp/dist/cli.js`.
//  - `attest-conductor`  — the BDK agent at packages/attest-conductor,
//                          served locally via a `cursor-bdk` bin. The
//                          `@cursor/bdk` dep is a Cursor-published tool
//                          and MUST be installed as a workspace
//                          devDependency ahead of time (not fetched
//                          by this entry). For deployed Cursor installs,
//                          swap this stanza for an HTTP MCP transport
//                          pointing at the Cursor-hosted conductor URL
//                          (BDK deploys expose /<slug>/v1/mcp per
//                          `npx @cursor/bdk deploy`).
//  - `attest-policy-dev` — a second attest-mcp instance pinned to
//                          `ATTEST_POLICY_MODE=LOG_ONLY`, so the editor-
//                          side chief can author policies against a live
//                          engine without blocking the user. Flip to
//                          ENFORCE (via the primary `attest` entry's env)
//                          once the policy bundle is trusted. Documented
//                          in .cursor/README.md.
//
// Keep CONDUCTOR_TOOL_NAME in sync with the server tool the conductor
// publishes for /autopilot (currently `run_autopilot_task`). The
// `invoke-attest-conductor` skill reads from the same constant.
export const CONDUCTOR_TOOL_NAME = 'run_autopilot_task';

// ── CEO (Phase 1) ──────────────────────────────────────────────────────
// The attest CEO is a BDK agent that sits above the conductor and owns
// the roadmap, discussion ingestion, intent extraction, plan drafting
// with approval round-trip, dispatch to the conductor, and resumption
// on chief completion. The CEO never bypasses the conductor to touch
// repos directly. See /cursor/stores/.../docs/attest-ceo-architecture.md
// for the full design and packages/attest-ceo/README.md for the agent
// itself.
//
// Shape 1 (Phase 1): Cursor chat ingestion + explicit paste only. No
// Slack / Linear / GitHub / meeting-notes webhooks (Phase 2). Default
// autonomy mode is `draft-and-approve` — opt-in `auto-dispatch` only.
export const CEO_SHARED_SOURCE = 'agents/shared/chiefs/ceo.md';

// Tool names published by attest-ceo-mcp. Keeping these as
// constants here mirrors the Shape-C POLICY_TOOL_NAMES pattern: a
// rename on the sibling attest-ceo-mcp side shows up as drift in this
// generator's output rather than a silent miss in the generated skill
// bodies.
export const CEO_MCP_TOOL_NAMES = {
  ingest: 'ingest_discussion',
  extract: 'extract_intent',
  draft: 'draft_plan',
  approve: 'approve_plan',
  deny: 'deny_plan',
  refine: 'refine_plan',
  dispatch: 'dispatch_plan',
  director: 'director_create_expert',
  roadmapSync: 'roadmap_sync',
  autonomySet: 'autonomy_set',
};

function generateMcp() {
  const out = new Map();
  const mcp = {
    $note:
      'Four MCP servers under Shape C + Phase-1 chiefs — ALL invoked via LOCAL workspace paths (no auto-install `npx`, no registry fetch). `attest` and `attest-policy-dev` run the local build output at `' +
      ATTEST_MCP_DIST_CLI +
      '` (produced by `npm --workspace packages/' +
      PKG_ATTEST_MCP +
      ' run build`); `attest-conductor` is served by the Cursor-published `@cursor/bdk` dev dependency (install locally; do not fetch at runtime). `attest-ceo` is the Phase-1 CEO MCP server (ingest / extract / draft / approve / dispatch / director), served from the workspace sibling `packages/attest-ceo-mcp/`. See .cursor/README.md "Shape-C policy mode flip" for how to flip to ENFORCE, "Local install" for how to prepare the workspace, and `.cursor/skills/attest-ceo/SKILL.md` for the CEO dial-out.',
    mcpServers: {
      attest: {
        $comment:
          'Primary ' +
          PKG_ATTEST_MCP +
          ' server. Under Shape C this is both the validator surface (unchanged) and the policy host (new in Shape C: ' +
          Object.values(POLICY_TOOL_NAMES).join(', ') +
          '). LOCAL-ONLY invocation: runs the workspace build output directly; a missing dist/ is a loud error (run `npm --workspace packages/' +
          PKG_ATTEST_MCP +
          ' run build`). Default policy mode is the server\'s own default (ENFORCE once the policy bundle lands); override per-user by setting ' +
          POLICY_MODE_ENV +
          ' in the user\'s shell env.',
        command: 'node',
        args: [ATTEST_MCP_DIST_CLI],
      },
      'attest-conductor': {
        $comment:
          'Local-dev invocation: served out of packages/' +
          PKG_ATTEST_CONDUCTOR +
          ' via the Cursor-published `cursor-bdk` bin (`@cursor/bdk` must be a workspace devDependency — install locally, do NOT fetch at runtime). For deployed Cursor installs, swap this stanza for { "url": "https://<your-conductor-host>/v1/mcp", "type": "http" } pointing at the deployed BDK agent (BDK deployments expose /<slug>/v1/mcp automatically via `npx @cursor/bdk deploy`). This package is NEVER published to npm; it lives only in this workspace.',
        command: 'cursor-bdk',
        args: [
          'serve',
          '--dir',
          ATTEST_CONDUCTOR_DIR,
          '--mode',
          'single',
        ],
      },
      'attest-policy-dev': {
        $comment:
          'Shape-C local-dev policy engine. Same local build as `attest`, pinned to ' +
          POLICY_MODE_ENV +
          '=LOG_ONLY so the editor-side chief (sdlc-lead) can test policies without blocking the user. Decisions get written through to `docs/work/policy-decisions.jsonl` by the policy hooks. Flip to ENFORCE (either here or in the `attest` entry) when the policy bundle is trusted; see .cursor/README.md.',
        command: 'node',
        args: [ATTEST_MCP_DIST_CLI],
        env: {
          [POLICY_MODE_ENV]: 'LOG_ONLY',
        },
      },
      'attest-ceo': {
        $comment:
          'Phase-1 attest CEO MCP server (ingest / extract / draft / approve / dispatch / director). LOCAL-ONLY private workspace package — never published to npm. Runs the workspace build output directly. Build with `npm --workspace packages/attest-ceo-mcp run build` first. For hosted installs the CEO is reached via the attest-ceo BDK agent (packages/attest-ceo); point `attest-conductor` dispatch at its /v1/mcp endpoint.',
        command: 'node',
        args: ['./packages/attest-ceo-mcp/dist/cli.js'],
      },
    },
  };
  out.set('mcp.json', JSON.stringify(mcp, null, 2) + '\n');
  return out;
}

// README: short architecture document that explains what the `.cursor/`
// tree contains, what it deliberately omits, and where the personas
// live. Reviewers hit this first; it is the one place that keeps the
// Shape-C / two-chief design story discoverable from the installed tree.
function generateReadme() {
  const out = new Map();
  const kept = [...TECHNIQUE_SKILL_KEEPS].sort().join(', ');
  const dropped = [...PERSONA_SKILL_DROPS].sort().join(', ');
  const policyToolList = Object.entries(POLICY_TOOL_NAMES)
    .map(([k, v]) => `\`${v}\` (${k})`)
    .join(', ');
  const ceoToolList = Object.entries(CEO_MCP_TOOL_NAMES)
    .map(([k, v]) => `  - \`${v}\` (${k})`)
    .join('\n');
  const body =
`# attest — Cursor target (Shape C — hybrid chief)

This directory is **generated** by \`scripts/build-target-cursor.mjs\`.
Do not edit any file under \`.cursor/\` by hand — CI runs
\`npm run build:cursor:check\` and fails on drift. Edit the canonical
sources in \`agents/\`, \`agents/shared/chiefs/\`, \`skills/\`,
\`rules/\`, and \`plugins/\`, then run \`npm run build:cursor\`.

## Architecture — two chiefs, one policy engine (LOCAL-ONLY)

attest's expert personas do **not** ship here as Cursor custom-mode /
subagent files. They live either as in-process handlers inside the
workspace sibling \`${PKG_ATTEST_MCP}\` (readers / analyzers /
validators) or as sandbox-isolated BDK agents in the workspace sibling
\`${PKG_ATTEST_EXPERTS}\` (writers / publishers / pushers). The chief
is split in two:

| Chief | Lives in | Starts a turn when | Owns |
|---|---|---|---|
| **Hosted conductor** (workspace sibling \`${PKG_ATTEST_CONDUCTOR}\`) | BDK pod (local or Cursor-hosted) | GitHub webhook (\`/autopilot <goal>\`) or scheduled run | Long-running, unattended autopilot |
| **sdlc-lead** (\`.cursor/skills/sdlc-lead/SKILL.md\` + \`.cursor/agents/sdlc-lead.md\`) | Cursor Agent in the user's editor | User keystroke in Cursor chat (\`/sdlc …\`, phase question, routing ask) | Interactive /sdlc work |

> **Local-only — hard constraint.** \`${PKG_ATTEST_MCP}\`,
> \`${PKG_ATTEST_EXPERTS}\`, and \`${PKG_ATTEST_CONDUCTOR}\` are
> workspace siblings in \`packages/\`. They are **never** fetched from
> the npm registry — not via \`npx\`'s auto-install flag, not under any
> flag. The generated \`.cursor/\` tree invokes them through local
> workspace paths; a missing local build is a loud error, not a silent
> download. The Cursor-hosted deploy path for the conductor is
> \`npx @cursor/bdk deploy\` from \`packages/${PKG_ATTEST_CONDUCTOR}\`;
> \`@cursor/bdk\` is Cursor's own tool and the only outside dependency.

Both share one \`attest-mcp\` policy engine, one \`attest-experts\`
fleet, and one phase-gate state machine. See
\`docs/attest-chief-architecture.md\` §Recommendation and
§Migration path for the full design rationale.

The local Cursor Agent is a **thin editor-time veneer** on top of those
pieces: it talks to them through MCP (\`.cursor/mcp.json\`),
dispatches long-running work through \`/invoke-attest-conductor\`,
runs interactive SDLC work as \`sdlc-lead\`, and relies on the local
hook layer for the editor-side "no" before destructive ops.

## What ships here

| Surface | Source | Purpose |
|---|---|---|
| \`rules/*.mdc\` | \`rules/*.md\` + \`agents/shared/*.md\` (top-level only) | Editor-time quality protocols (CHALLENGER, FIX_VERIFY, GATE_SCORING, PERSISTENCE, …) as on-demand rules with \`@file\` pointers to the committed sources. |
| \`agents/sdlc-lead.md\` | \`${SDLC_LEAD_SHARED_SOURCE}\` | Editor-side **SDLC** chief as a Cursor custom-mode / subagent; tool allowlist excludes raw bash for destructive ops. |
| \`skills/sdlc-lead/SKILL.md\` | \`${SDLC_LEAD_SHARED_SOURCE}\` | Same shared source, framed as a skill the current Cursor Agent loads when the user asks for /sdlc work. |
| \`agents/attest-ceo.md\` | \`${CEO_SHARED_SOURCE}\` | Editor-side **CEO** chief as a Cursor custom-mode / subagent; tool allowlist excludes raw bash — mutations go through \`attest-ceo-mcp\` + dispatch via \`attest-conductor\`. |
| \`skills/attest-ceo/SKILL.md\` | \`${CEO_SHARED_SOURCE}\` | Same shared source, framed as a skill the current Cursor Agent loads when the user types a \`/ceo\` command. |
| \`skills/invoke-attest-conductor/SKILL.md\` | hand-authored | Routes long-running /multi-expert work to the hosted conductor BDK agent. Prefers \`sdlc-lead\` for small SDLC asks. |
| \`skills/<technique>/SKILL.md\` (${TECHNIQUE_SKILL_KEEPS.size} others) | \`skills/*/SKILL.md\` | Only **technique / procedure** skills. See the keep set below. |
| \`hooks.json\` + \`hooks/block-*.sh\`, \`hooks/post-edit-check.sh\`, \`hooks/telemetry.sh\`, \`hooks/inject-state.sh\`, \`hooks/end-of-turn-gate.sh\` | \`plugins/expert-hooks.ts\` | Baseline (pre-Shape-C) hooks: dangerous-bash blocker, credential-write blocker, afterFileEdit lint/typecheck/secret-scan, postToolUse telemetry, sessionStart STATE.md injection (**local-only**: Cursor cloud agents do not fire \`sessionStart\`), stop phase-gate. |
| \`hooks/evaluate-shell-policy.sh\`, \`hooks/evaluate-write-policy.sh\` | generated | Shape-C policy integration: delegates to attest-mcp's policy engine before every shell call and file mutation. See below. |
| \`mcp.json\` | generated | Four MCP servers: \`attest\`, \`attest-conductor\`, \`attest-policy-dev\`, \`attest-ceo\`. See below. |

### CEO MCP surface (\`attest-ceo\` server, Phase 1)

Local workspace package \`attest-ceo-mcp\` (\`"private": true\`,
not published to npm). Build with
\`npm --workspace packages/attest-ceo-mcp run build\` once; the
\`mcp.json\` entry spawns \`node packages/attest-ceo-mcp/dist/cli.js\`.
Tools exposed (names tracked by \`CEO_MCP_TOOL_NAMES\` in the generator):

${ceoToolList}

Plus four resources: \`attest://ceo/roadmap/current\`,
\`attest://ceo/commitments/open\`, \`attest://ceo/plans/awaiting\`,
\`attest://ceo/decisions/recent\`.

### Kept skills (techniques, ${TECHNIQUE_SKILL_KEEPS.size + 3} total — includes \`invoke-attest-conductor\` + \`sdlc-lead\` + \`attest-ceo\`)

${kept}, invoke-attest-conductor, sdlc-lead, attest-ceo

### Dropped skills (personas — live in the workspace sibling ${PKG_ATTEST_EXPERTS}, ${PERSONA_SKILL_DROPS.size} total)

${dropped}

See \`scripts/build-target-cursor.mjs\` → \`PERSONA_SKILL_DROPS\` /
\`TECHNIQUE_SKILL_KEEPS\` / \`SKILL_AMBIGUITY_NOTES\` for the per-skill
rationale, and the chief architecture doc
(\`docs/attest-chief-architecture.md\`) for the Shape-C reasoning.

## Shape-C policy hooks

Two hooks delegate to the attest-mcp policy engine on every call:

| Hook | Cursor surface | attest-mcp tool |
|---|---|---|
| \`hooks/evaluate-shell-policy.sh\` | \`beforeShellExecution\` | \`attest.${POLICY_TOOL_NAMES.shell}\` |
| \`hooks/evaluate-write-policy.sh\` | \`preToolUse\` matcher \`Write\`/\`Edit\` | \`attest.${POLICY_TOOL_NAMES.write}\` |

Each hook walks a **local-only** invocation chain, in order:

1. \`${POLICY_CLI_PRIMARY} evaluate --kind=<shell|write>\` — the
   dedicated bin shipped by \`${PKG_ATTEST_MCP}\`'s \`bin\` field;
   resolves via \`./node_modules/.bin/\` after \`npm install\` at
   the repo root.
2. \`${POLICY_CLI_SECONDARY} policy --kind=<shell|write>\` — the main
   \`${PKG_ATTEST_MCP}\` CLI's \`policy\` subcommand (compat path).
3. **Hard fail.** The hook never shells out to \`npx\` with the
   auto-install flag, never passes \`--package=…\`, never fetches
   from the npm registry under any flag. If neither bin resolves, the
   hook returns a crisp error naming the install step
   (\`${LOCAL_INSTALL_HINT}\`).

The hook pipes the Cursor hook JSON into whichever bin resolves,
expects a Cursor hook decision JSON on stdout, and respects
\`${POLICY_MODE_ENV}\`:

- \`ENFORCE\` — fail-closed on engine error or \`deny\`.
- \`LOG_ONLY\` — log + allow on engine error (dev / policy authoring).
- \`OFF\` — skip the policy call entirely (local escape hatch).

The hooks are **additive** to the hard-coded blockers
(\`block-dangerous.sh\`, \`block-credentials.sh\`); a deny from either
stops the op. Decisions in LOG_ONLY mode are appended to
\`docs/work/policy-decisions.jsonl\`.

\`beforeMcpInvoke\` is **not** wired: Cursor's current hook surface
(https://cursor.com/docs/agent/hooks) does not expose that hook, so
the editor-side "no" before an MCP tool call cannot be enforced
client-side today. attest-mcp's server-side \`tools/call\` check
remains the authoritative chokepoint; the user hears the refusal via
the MCP error. Reintroduce the client-side mirror when Cursor adds the
hook.

## Shape-C MCP servers (LOCAL-ONLY)

\`.cursor/mcp.json\` wires three MCP servers; all three are invoked via
LOCAL workspace paths — no auto-install \`npx\`, no registry fetch:

- \`attest\` — \`node ${ATTEST_MCP_DIST_CLI}\`. The policy host and the
  validator surface. Policy tools (new in Shape C): ${policyToolList}.
- \`attest-conductor\` — \`cursor-bdk serve --dir ${ATTEST_CONDUCTOR_DIR} --mode single\`.
  The Cursor-published \`@cursor/bdk\` tool must be installed as a
  workspace devDependency ahead of time; do NOT expect it to be
  fetched at hook time. For a Cursor-hosted deploy, swap this stanza
  for an HTTP MCP transport pointing at the URL that
  \`npx @cursor/bdk deploy\` returned.
- \`attest-policy-dev\` — same local build as \`attest\`, pinned to
  \`${POLICY_MODE_ENV}=LOG_ONLY\` so sdlc-lead can author / test
  policies against a live engine without blocking the user. Decisions
  go to \`docs/work/policy-decisions.jsonl\` via the hooks.

### Local install (one-time)

Before Cursor can launch the MCP servers or run the policy hooks:

\`\`\`sh
npm install                               # links workspace siblings into
                                           # ./node_modules/.bin/
npm --workspace packages/${PKG_ATTEST_MCP} run build
                                           # produces the dist/ output
                                           # that mcp.json invokes
\`\`\`

Neither step touches the registry for \`${PKG_ATTEST_MCP}\`,
\`${PKG_ATTEST_EXPERTS}\`, or \`${PKG_ATTEST_CONDUCTOR}\` — they are
workspace packages, linked locally.

### Flipping policy mode: LOG_ONLY → ENFORCE

Shape-C ships with the policy engine in **LOG_ONLY mode** by default so
you can author policies before they start blocking you. To flip to
ENFORCE:

1. **Review the decision log.** Open \`docs/work/policy-decisions.jsonl\`
   and the attest-mcp policy audit stream. Confirm the policies you
   expect to apply have been exercised and the deny/allow calls match
   your intent. (A good signal: at least one week of normal SDLC work
   with no false denies on the paths you care about.)
2. **Flip the mode.** Set \`${POLICY_MODE_ENV}=ENFORCE\` in the user
   shell env (e.g. your \`.zshrc\`), or in the \`attest\` entry of
   \`.cursor/mcp.json\` under \`env\`. The \`attest-policy-dev\`
   server stays pinned to LOG_ONLY so you still have a live
   authoring sandbox.
3. **Keep an escape hatch.** \`${POLICY_MODE_ENV}=OFF\` disables the
   client-side policy hooks entirely (the server-side chokepoint still
   applies). Use for one-off local debugging only — the hook layer is
   the editor-experience "no" that keeps you from forming plans the
   server will reject anyway.

## Regenerate

\`\`\`sh
npm run build:cursor         # write mode: regenerate the full tree
npm run build:cursor:check   # CI drift gate: exits 1 on any difference
\`\`\`
`;
  out.set('README.md', body);
  return out;
}

// ── PARITY CHECK ────────────────────────────────────────────────────────
// Every attest source skill must either be emitted or appear in a
// documented set (DROP/KEEP) with a reason. Prevents a newly-added
// source skill from being silently dropped by the Cursor target.
//
// Shape-C additions:
//   • The sdlc-lead chief MUST exist at both outputs (skill + agent) and
//     the shared source MUST exist.
//   • The policy hooks MUST be wired into hooks.json AND exist on disk.
//   • The attest-policy-dev MCP entry MUST exist in mcp.json.
//   • Every policy tool name in POLICY_TOOL_NAMES MUST appear in the
//     emitted sdlc-lead chief source or the hooks (so a rename on the
//     sibling attest-mcp side forces a visible drift here).
export function parityCheck(outputs) {
  const problems = [];
  const warnings = [];

  const srcSkills = new Set();
  const skillsDir = join(ROOT, 'skills');
  if (existsSync(skillsDir)) {
    for (const e of readdirSync(skillsDir)) {
      if (existsSync(join(skillsDir, e, 'SKILL.md'))) srcSkills.add(kebab(e));
    }
  }
  const outSkills = new Set();
  for (const key of outputs.keys()) {
    const m = key.match(/^skills\/([^\/]+)\/SKILL\.md$/);
    if (m) outSkills.add(m[1]);
  }

  // Every source skill must be classified: either on PERSONA_SKILL_DROPS
  // or TECHNIQUE_SKILL_KEEPS. Unclassified = fail.
  for (const s of srcSkills) {
    const dropped = PERSONA_SKILL_DROPS.has(s);
    const kept = TECHNIQUE_SKILL_KEEPS.has(s);
    if (!dropped && !kept) {
      problems.push(
        `skill parity: ${s} is not classified; add it to either ` +
          `PERSONA_SKILL_DROPS (with reason) or TECHNIQUE_SKILL_KEEPS.`
      );
    }
    if (dropped && kept) {
      problems.push(
        `skill parity: ${s} appears in BOTH drop and keep sets — pick one.`
      );
    }
  }
  // No skill output should exist for a persona-drop; no skill output
  // should be missing for a technique-keep.
  for (const s of TECHNIQUE_SKILL_KEEPS) {
    if (!srcSkills.has(s)) {
      problems.push(
        `skill parity: TECHNIQUE_SKILL_KEEPS lists '${s}' but there is no source skills/${s}/SKILL.md`
      );
      continue;
    }
    if (!outSkills.has(s)) {
      problems.push(`skill parity: ${s} is kept but has no .cursor/skills/${s}/SKILL.md`);
    }
  }
  for (const s of PERSONA_SKILL_DROPS) {
    if (outSkills.has(s)) {
      problems.push(`skill parity: ${s} is a persona drop but WAS emitted as .cursor/skills/${s}/SKILL.md`);
    }
  }
  // The hand-authored invoke-attest-conductor skill is expected.
  if (!outSkills.has('invoke-attest-conductor')) {
    problems.push(`skill parity: invoke-attest-conductor is missing from the output tree`);
  }

  // Phase-1 CEO: skill + agent + shared source + MCP server entry.
  if (!outSkills.has('attest-ceo')) {
    problems.push(
      `ceo parity: attest-ceo skill is missing from the output tree (expected .cursor/skills/attest-ceo/SKILL.md)`,
    );
  }
  if (!outputs.has('agents/attest-ceo.md')) {
    problems.push(
      `ceo parity: attest-ceo agent is missing from the output tree (expected .cursor/agents/attest-ceo.md)`,
    );
  }
  const ceoSharedAbs = join(ROOT, CEO_SHARED_SOURCE);
  if (!existsSync(ceoSharedAbs)) {
    problems.push(
      `ceo parity: shared chief source missing at ${CEO_SHARED_SOURCE} — generateCeoSkill/Agent read from this.`,
    );
  }
  const mcpBlob = outputs.get('mcp.json');
  if (mcpBlob) {
    try {
      const mcp = JSON.parse(mcpBlob);
      if (!mcp?.mcpServers?.['attest-ceo']) {
        problems.push(
          `ceo parity: .cursor/mcp.json does not include the attest-ceo server entry`,
        );
      }
    } catch (err) {
      warnings.push(`ceo parity: mcp.json unparseable (${err.message})`);
    }
  }

  // Ambiguity notes are warnings, not failures — but every entry in the
  // notes map MUST reference a skill actually in one of the two sets.
  for (const k of Object.keys(SKILL_AMBIGUITY_NOTES)) {
    if (!PERSONA_SKILL_DROPS.has(k) && !TECHNIQUE_SKILL_KEEPS.has(k)) {
      warnings.push(
        `ambiguity note for '${k}' points at no classified skill`
      );
    }
  }

  // ── Shape-C parity ────────────────────────────────────────────────────

  // Shared chief source must exist.
  const sharedSrc = join(ROOT, SDLC_LEAD_SHARED_SOURCE);
  if (!existsSync(sharedSrc)) {
    problems.push(
      `shape-c parity: shared chief source missing at ${SDLC_LEAD_SHARED_SOURCE}`
    );
  }

  // Both sdlc-lead outputs must be emitted.
  if (!outputs.has('skills/sdlc-lead/SKILL.md')) {
    problems.push(`shape-c parity: skills/sdlc-lead/SKILL.md is missing from the output tree`);
  }
  if (!outputs.has('agents/sdlc-lead.md')) {
    problems.push(`shape-c parity: agents/sdlc-lead.md is missing from the output tree`);
  }

  // Both outputs must share content with the shared source (both must
  // contain at least one phrase that is distinctive to the chief source).
  if (outputs.has('skills/sdlc-lead/SKILL.md') && outputs.has('agents/sdlc-lead.md')) {
    const skillOut = outputs.get('skills/sdlc-lead/SKILL.md');
    const agentOut = outputs.get('agents/sdlc-lead.md');
    const marker = 'editor-side chief';
    if (!skillOut.includes(marker) || !agentOut.includes(marker)) {
      problems.push(
        `shape-c parity: sdlc-lead skill + agent do not both include '${marker}' — ` +
          `shared source not being pulled through generateSdlcLead* correctly.`
      );
    }
  }

  // Policy hook scripts must be emitted.
  for (const name of Object.keys(SHAPE_C_HOOK_SCRIPTS)) {
    if (!outputs.has(`hooks/${name}`)) {
      problems.push(`shape-c parity: hooks/${name} is missing from the output tree`);
    }
  }

  // hooks.json must wire the policy hooks on both expected surfaces.
  const hooksJson = outputs.get('hooks.json');
  if (!hooksJson) {
    problems.push(`shape-c parity: hooks.json is missing from the output tree`);
  } else {
    if (!hooksJson.includes('.cursor/hooks/evaluate-shell-policy.sh')) {
      problems.push(
        `shape-c parity: hooks.json does not wire evaluate-shell-policy.sh into beforeShellExecution`
      );
    }
    if (!hooksJson.includes('.cursor/hooks/evaluate-write-policy.sh')) {
      problems.push(
        `shape-c parity: hooks.json does not wire evaluate-write-policy.sh into preToolUse`
      );
    }
  }

  // mcp.json must carry all three Shape-C entries.
  const mcpJson = outputs.get('mcp.json');
  if (!mcpJson) {
    problems.push(`shape-c parity: mcp.json is missing from the output tree`);
  } else {
    for (const name of ['attest', 'attest-conductor', 'attest-policy-dev']) {
      if (!mcpJson.includes(`"${name}"`)) {
        problems.push(`shape-c parity: mcp.json missing MCP server entry '${name}'`);
      }
    }
    if (!mcpJson.includes(`"${POLICY_MODE_ENV}": "LOG_ONLY"`)) {
      problems.push(
        `shape-c parity: mcp.json's attest-policy-dev entry does not pin ${POLICY_MODE_ENV}=LOG_ONLY`
      );
    }
  }

  // Policy tool names must survive renames: every tool in
  // POLICY_TOOL_NAMES must appear in the sdlc-lead skill output or the
  // hooks/README, so a sibling-attest-mcp rename shows up as drift here.
  const policyReferences = [
    outputs.get('skills/sdlc-lead/SKILL.md') || '',
    outputs.get('agents/sdlc-lead.md') || '',
    outputs.get('hooks.json') || '',
    outputs.get('README.md') || '',
    outputs.get('hooks/evaluate-shell-policy.sh') || '',
    outputs.get('hooks/evaluate-write-policy.sh') || '',
  ].join('\n');
  for (const [kind, toolName] of Object.entries(POLICY_TOOL_NAMES)) {
    if (!policyReferences.includes(toolName)) {
      problems.push(
        `shape-c parity: policy tool '${toolName}' (${kind}) is defined in POLICY_TOOL_NAMES but ` +
          `does not appear anywhere in the emitted sdlc-lead chief, hooks, or README. ` +
          `Did a sibling attest-mcp rename happen without a corresponding update here?`
      );
    }
  }

  return {
    problems,
    warnings,
    srcSkills: srcSkills.size,
    outSkills: outSkills.size,
    dropped: PERSONA_SKILL_DROPS.size,
    kept: TECHNIQUE_SKILL_KEEPS.size,
  };
}

// ── MAIN ────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const outputs = new Map();

  for (const [k, v] of generateRules()) outputs.set(k, v);
  for (const [k, v] of generateSkills()) outputs.set(k, v);
  for (const [k, v] of generateAgents()) outputs.set(k, v);
  for (const [k, v] of generateHooks()) outputs.set(k, v);
  for (const [k, v] of generateMcp()) outputs.set(k, v);
  for (const [k, v] of generateReadme()) outputs.set(k, v);
  // Director chief — hand-authored directly in `.cursor/` (feat/attest-director,
  // PR #17). No shared source file exists yet; the Director's authoritative
  // persona content lives in the composed `.cursor/agents/director.md` and
  // `.cursor/skills/director/SKILL.md` on `release/v0.1.0`. We pass them
  // through here so the parity check (`--check`) accepts them. When the
  // next cycle factors a shared `agents/shared/chiefs/director.md`, swap
  // this pass-through for a proper `generateDirectorAgent()` /
  // `generateDirectorSkill()` pair mirroring the CEO pattern above.
  for (const [k, v] of passthroughManual([
    'agents/director.md',
    'skills/director/SKILL.md',
  ])) outputs.set(k, v);

  const manifest = [...outputs.keys()].sort();
  outputs.set(
    'GENERATED_FILES.txt',
    '# Generated by attest/scripts/build-target-cursor.mjs — DO NOT EDIT THESE FILES HERE.\n' +
      '# Edit the canonical source in attest, then run: npm run build:cursor\n' +
      '# `--check` is the CI drift gate; it diffs the committed .cursor/ tree against this generator\'s output.\n' +
      '# Architecture: orchestrator-first + Shape C (hybrid chief). Expert personas live in the workspace\n' +
      '# sibling attest-experts, orchestrated by the workspace sibling attest-conductor. All packages are\n' +
      '# LOCAL workspace siblings; NEVER fetched from the npm registry.\n\n' +
      manifest.join('\n') +
      '\n'
  );

  const EXEC_PATHS = new Set([
    ...Object.keys(HOOK_SCRIPTS).map((n) => `hooks/${n}`),
    ...Object.keys(SHAPE_C_HOOK_SCRIPTS).map((n) => `hooks/${n}`),
  ]);

  let drift = [];
  for (const [rel, content] of outputs) {
    const dest = join(OUT, rel);
    const current = existsSync(dest) ? readFileSync(dest, 'utf8') : null;
    if (current !== content) drift.push(rel + (current === null ? ' (missing)' : ''));
    if (MODE === 'write') {
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, content);
      if (EXEC_PATHS.has(rel)) {
        try { chmodSync(dest, 0o755); } catch { /* best-effort */ }
      }
    }
  }

  const extras = [];
  if (existsSync(OUT)) {
    for (const abs of walk(OUT, '')) {
      if (abs.includes('/.git/')) continue;
      const rel = relative(OUT, abs);
      if (!outputs.has(rel) && !rel.endsWith('/.gitkeep')) extras.push(rel);
    }
  }
  if (MODE === 'write') {
    for (const rel of extras) {
      try { rmSync(join(OUT, rel), { force: true }); } catch { /* ignore */ }
    }
    // Also clean out any now-empty directories (common after dropping
    // .cursor/agents/ or persona skill subtrees).
    for (const abs of [...walk(OUT, '')].sort().reverse()) {
      try {
        const dir = dirname(abs);
        if (dir === OUT) continue;
        if (statSync(dir).isDirectory() && readdirSync(dir).length === 0) {
          rmSync(dir, { recursive: true, force: true });
        }
      } catch { /* ignore */ }
    }
    // After the extras-and-empties pass, remove any top-level
    // directories under OUT that are now empty (e.g. agents/).
    if (existsSync(OUT)) {
      for (const e of readdirSync(OUT)) {
        const p = join(OUT, e);
        try {
          if (statSync(p).isDirectory() && readdirSync(p).length === 0) {
            rmSync(p, { recursive: true, force: true });
          }
        } catch { /* ignore */ }
      }
    }
  }

  const parity = parityCheck(outputs);

  if (parity.problems.length) {
    console.log(`PARITY PROBLEMS (${parity.problems.length}):`);
    for (const p of parity.problems) console.log('  ' + p);
  }
  if (parity.warnings.length) {
    console.log(`PARITY WARNINGS (${parity.warnings.length}):`);
    for (const w of parity.warnings) console.log('  ' + w);
  }

  if (MODE === 'check') {
    if (drift.length) {
      console.log(`DRIFT (${drift.length} file(s) differ from generated output):`);
      for (const d of drift) console.log('  ' + d);
    }
    if (extras.length) {
      console.log(`EXTRAS (${extras.length} file(s) in .cursor/ this generator does not emit):`);
      for (const e of extras) console.log('  ' + e);
    }
    if (drift.length || extras.length || parity.problems.length) process.exit(1);
    console.log(
      `cursor target in sync: ${outputs.size} generated files match ` +
        `(${parity.outSkills}/${parity.srcSkills} skills emitted; ${parity.dropped} persona drops, ` +
        `${parity.kept} technique keeps + 1 invoke-conductor + 1 sdlc-lead chief; Shape-C hooks + policy MCP wired)`
    );
  } else {
    console.log(
      `wrote ${outputs.size} generated files to ${OUT} ` +
        `(${drift.length} changed, ${extras.length} stale removed; ` +
        `${parity.outSkills}/${parity.srcSkills} skills emitted, ${parity.dropped} persona drops, ` +
        `${parity.kept} technique keeps; Shape-C: sdlc-lead chief + policy hooks + attest-policy-dev)`
    );
    if (parity.problems.length) process.exit(1);
  }
}
