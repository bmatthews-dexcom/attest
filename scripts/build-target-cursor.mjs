#!/usr/bin/env node
// build-target-cursor.mjs — Cursor build target (orchestrator-first).
//
// Shape 2 of the design report: attest's expert personas live as BDK
// agents in the sibling package `attest-experts`, invoked by
// the sibling `attest-conductor`. Cursor only ships a thin
// local-editor veneer:
//
//   .cursor/rules/*.mdc    — attest shared protocols as @file-pointer
//                            rules (editor-time guidance)
//   .cursor/hooks.json     — 1:1 port of plugins/expert-hooks.ts
//   .cursor/hooks/*.sh     — the scripts those hooks run
//   .cursor/mcp.json       — points at the `attest` MCP server
//                            (attest-mcp)
//   .cursor/skills/*/      — ONLY technique/procedure skills; expert
//                            personas are deliberately omitted
//   .cursor/README.md      — explains the architecture + where personas live
//
// Deliberately NOT emitted on this target:
//   .cursor/agents/*.md         — ships as BDK in attest-experts
//   .cursor/skills/<persona>/   — same reason; see PERSONA_SKILL_DROPS below
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
    'ORCHESTRATOR-FIRST ARCHITECTURE: expert personas ship as BDK agents in the sibling package `attest-experts`, spawned on demand by `attest-conductor`. The local Cursor Agent calls out to the conductor via MCP; it does not host the personas itself.',
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
// now ship as BDK agents in attest-experts and are invoked via
// the conductor, not as local Cursor slash-commands. Keeping them here
// would show the user a /security that cannot route anywhere.
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
  // coordinates three personas. Both live in BDK; the Cursor-side
  // replacement is `invoke-attest-conductor`.
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
    "Dropped: this IS the conductor outer loop. Replaced by `invoke-attest-conductor` which teaches the local agent to call attest-conductor.",
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
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
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
    `  they live as BDK agents in attest-experts and are\n` +
    `  invoked by attest-conductor. To route the local Cursor\n` +
    `  agent to the conductor, use /invoke-attest-conductor.\n` +
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

  return out;
}

function generateInvokeConductorSkill() {
  return `---
name: invoke-attest-conductor
description: 'Route a long-running / multi-expert / unattended attest task (autopilot, SDLC phases, fan-out code review, security audits that need multiple personas) to the attest conductor BDK agent. Use whenever the user asks for /sdlc, /security, /autopilot, /review, or any multi-persona workflow — Cursor itself does not host those personas (they live in attest-experts).'
disable-model-invocation: true
---

<!--
  attest-cursor skill — orchestrator-first architecture.
  Expert personas live in attest-experts, orchestrated by
  attest-conductor. This skill is the LOCAL Cursor side's
  "dial out" to that orchestrator.
-->

# invoke-attest-conductor

The local Cursor Agent is a thin editor-time veneer; the attest expert
personas (security-auditor, code-reviewer, landscape-mapper, …) run as
BDK agents in **attest-experts**, orchestrated by
**attest-conductor**. This skill teaches you to invoke that
orchestrator rather than attempting to run the persona workflow inline
(which would silently drop the HANDOFF plumbing, gate scoring, delegation
log, and multi-model review).

## When to use

Invoke the conductor whenever the user asks for anything that would, on
OpenCode, have gone through \`sdlc-lead\` or any of the primary expert
agents. Natural-language triggers:

- "run /sdlc init / onboard / feature / improve …"
- "do a full security audit"
- "review this change" (multi-pass / cross-expert)
- "run autopilot" / "finish the board"
- "ship a release" / "cut v1.2.3"
- Anything that reads like an attest slash command but is not a technique
  skill present under \`.cursor/skills/\`.

If the request is a single-step technique already covered by a local
Cursor skill (\`/explore\`, \`/pre-code\`, \`/simplify\`, \`/gate\`,
\`/goal\`, \`/wave\`, \`/reflow\`, …), use that skill directly instead.

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

## Why not host the personas locally?

See \`.cursor/README.md\`. Short version: Cursor is single-agent-with-
subagents; attest's value is 33+ specialists with HANDOFF plumbing, gate
scoring, delegation log, multi-model review, and a conductor loop that
owns tickets / worktrees / merges. That shape is what BDK is for; the
local-editor surface is the hook/rule layer plus the few genuine
technique skills (\`.cursor/skills/*\`).
`;
}

// HOOKS: `.cursor/hooks.json` + `.cursor/hooks/*.sh`. Ports the subset
// of plugins/expert-hooks.ts that generalizes to Cursor's hooks surface
// 1:1. See design report §6 "Hooks layer" for the shape and §3 "Agent
// Hooks" for the cloud-support matrix. sessionStart STATE.md injection
// is LOCAL-ONLY (Cursor cloud agents do not run sessionStart).
function generateHooks() {
  const out = new Map();
  const hooksJson = {
    version: 1,
    _note:
      'sessionStart (inject-state.sh) is LOCAL-ONLY; Cursor cloud agents do not run sessionStart (per https://cursor.com/docs/agent/hooks). All other hooks run in cloud and local.',
    hooks: {
      beforeShellExecution: [{ command: '.cursor/hooks/block-dangerous.sh' }],
      preToolUse: [
        { command: '.cursor/hooks/block-credentials.sh', matcher: 'Write' },
        { command: '.cursor/hooks/block-credentials.sh', matcher: 'Edit' },
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
  deny "attempted npm-registry upload — this project is local-only; no package is pushed to any public registry"
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

// MCP: two servers today.
//  - `attest`           — the stdio MCP server from attest-mcp
//                         (77 validators, phase_gate_check, route_goal,
//                         list_experts, 74 resources, 37 prompts).
//  - `attest-conductor` — the BDK agent at packages/attest-conductor,
//                         served locally via `bdk serve`. Deployed users
//                         can swap this stanza for an HTTP MCP transport
//                         pointing at the deployed conductor URL.
//
// Keep CONDUCTOR_TOOL_NAME in sync with the server tool the conductor
// publishes for /autopilot (currently `run_autopilot_task`). The
// `invoke-attest-conductor` skill reads from the same constant.
export const CONDUCTOR_TOOL_NAME = 'run_autopilot_task';

function generateMcp() {
  const out = new Map();
  const mcp = {
    $note:
      'Two MCP servers, both backed by local workspace packages (nothing is published to npm). `attest` is the stdio MCP server from packages/attest-mcp (77 validators + phase_gate_check + route_goal + list_experts), run as `node packages/attest-mcp/dist/cli.js` — run `npm run build:mcp` once after `npm install` to produce the dist. `attest-conductor` is the BDK agent that runs the /autopilot Ralph loop, served out of packages/attest-conductor via @cursor/bdk serve. See .cursor/skills/invoke-attest-conductor/SKILL.md for the three-path dial-out (preferred: MCP tool, fallback: HTTPS, fallback: GitHub comment).',
    mcpServers: {
      attest: {
        $comment:
          'Workspace sibling — not uploaded to any registry. Build it once with `npm --prefix packages/attest-mcp run build` (or `./scripts/local-install.sh`). ${workspaceFolder} is Cursor-expanded to the project root.',
        command: 'node',
        args: ['${workspaceFolder}/packages/attest-mcp/dist/cli.js'],
      },
      'attest-conductor': {
        $comment:
          'Local invocation: served out of packages/attest-conductor via @cursor/bdk serve --mode single. For a Cursor-hosted deploy (after `./scripts/deploy.sh`), swap this stanza for { "url": "https://<slug>/<team>/v1/mcp", "type": "http" } using the slug the deploy returned.',
        command: 'npx',
        args: [
          '-y',
          '@cursor/bdk',
          'serve',
          '--dir',
          './packages/attest-conductor',
          '--mode',
          'single',
        ],
      },
    },
  };
  out.set('mcp.json', JSON.stringify(mcp, null, 2) + '\n');
  return out;
}

// README: short architecture document that explains what the `.cursor/`
// tree contains, what it deliberately omits, and where the personas
// live. Reviewers hit this first; it is the one place that keeps the
// orchestrator-first design story discoverable from the installed tree.
function generateReadme() {
  const out = new Map();
  const kept = [...TECHNIQUE_SKILL_KEEPS].sort().join(', ');
  const dropped = [...PERSONA_SKILL_DROPS].sort().join(', ');
  const body =
`# attest — Cursor target

This directory is **generated** by \`scripts/build-target-cursor.mjs\`.
Do not edit any file under \`.cursor/\` by hand — CI runs
\`npm run build:cursor:check\` and fails on drift. Edit the canonical
sources in \`agents/\`, \`skills/\`, \`rules/\`, and \`plugins/\`, then
run \`npm run build:cursor\`.

## Architecture (orchestrator-first)

attest's expert personas (\`security-auditor\`, \`code-reviewer\`,
\`sdlc-lead\`, \`ux-engineer\`, …) do **not** ship here as Cursor
custom-mode / subagent files. They live as BDK agents in a sibling
package, orchestrated by a conductor:

- [\`attest-experts\`](https://github.com/bmatthews-dexcom/attest/tree/main/packages/attest-experts) — each primary attest expert
  packaged as a \`defineAgent({ … })\` BDK agent. Private workspace sibling under \`packages/\`.
- [\`attest-conductor\`](https://github.com/bmatthews-dexcom/attest/tree/main/packages/attest-conductor) — the outer loop that
  claims tickets, dispatches expert agents, scores HANDOFF returns,
  and merges completed work (the \`v3.9.0\` autopilot shape). Private workspace sibling.

The local Cursor Agent is a **thin editor-time veneer**: it talks to
those packages through MCP (\`.cursor/mcp.json\`) and the
\`/invoke-attest-conductor\` skill, and relies on the local hook layer
for safety + editor-time quality guidance.

## What ships here

| Surface | Source | Purpose |
|---|---|---|
| \`rules/*.mdc\` | \`rules/*.md\` + \`agents/shared/*.md\` | Editor-time quality protocols (CHALLENGER, FIX_VERIFY, GATE_SCORING, PERSISTENCE, …) as on-demand rules with \`@file\` pointers to the committed sources. |
| \`skills/*/SKILL.md\` | \`skills/*/SKILL.md\` + hand-authored | Only **technique / procedure** skills. See the keep set below. |
| \`hooks.json\` + \`hooks/*.sh\` | \`plugins/expert-hooks.ts\` | 1:1 port of the attest plugin: dangerous-bash blocker, credential-write blocker, afterFileEdit lint/typecheck/secret-scan, postToolUse telemetry, sessionStart STATE.md injection (**local-only**: Cursor cloud agents do not fire \`sessionStart\`), stop phase-gate. |
| \`mcp.json\` | generated | Points at the \`attest\` MCP server (\`attest-mcp\`). |

### Kept skills (techniques, ${TECHNIQUE_SKILL_KEEPS.size + 1} total — includes \`invoke-attest-conductor\`)

${kept}, invoke-attest-conductor

### Dropped skills (personas — live in attest-experts, ${PERSONA_SKILL_DROPS.size} total)

${dropped}

See \`scripts/build-target-cursor.mjs\` → \`PERSONA_SKILL_DROPS\` /
\`TECHNIQUE_SKILL_KEEPS\` / \`SKILL_AMBIGUITY_NOTES\` for the per-skill
rationale, and the design report at
\`docs/attest-cursor-integration.md\` for the architecture reasoning.

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

  // Ambiguity notes are warnings, not failures — but every entry in the
  // notes map MUST reference a skill actually in one of the two sets.
  for (const k of Object.keys(SKILL_AMBIGUITY_NOTES)) {
    if (!PERSONA_SKILL_DROPS.has(k) && !TECHNIQUE_SKILL_KEEPS.has(k)) {
      warnings.push(
        `ambiguity note for '${k}' points at no classified skill`
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
  for (const [k, v] of generateHooks()) outputs.set(k, v);
  for (const [k, v] of generateMcp()) outputs.set(k, v);
  for (const [k, v] of generateReadme()) outputs.set(k, v);

  const manifest = [...outputs.keys()].sort();
  outputs.set(
    'GENERATED_FILES.txt',
    '# Generated by attest/scripts/build-target-cursor.mjs — DO NOT EDIT THESE FILES HERE.\n' +
      '# Edit the canonical source in attest, then run: npm run build:cursor\n' +
      '# `--check` is the CI drift gate; it diffs the committed .cursor/ tree against this generator\'s output.\n' +
      '# Architecture: orchestrator-first — expert personas live in attest-experts, orchestrated by attest-conductor.\n\n' +
      manifest.join('\n') +
      '\n'
  );

  const EXEC_PATHS = new Set(
    Object.keys(HOOK_SCRIPTS).map((n) => `hooks/${n}`)
  );

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
        `(${parity.outSkills}/${parity.srcSkills} skills emitted; ${parity.dropped} persona drops, ${parity.kept} technique keeps + 1 invoke-conductor)`
    );
  } else {
    console.log(
      `wrote ${outputs.size} generated files to ${OUT} ` +
        `(${drift.length} changed, ${extras.length} stale removed; ` +
        `${parity.outSkills}/${parity.srcSkills} skills emitted, ${parity.dropped} persona drops, ${parity.kept} technique keeps)`
    );
    if (parity.problems.length) process.exit(1);
  }
}
