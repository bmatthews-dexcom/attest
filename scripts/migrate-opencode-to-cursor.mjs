#!/usr/bin/env node
// migrate-opencode-to-cursor.mjs — in-place OpenCode → Cursor migration.
//
// Goal: when a user already has attest-for-OpenCode installed on this
// machine (or in this project), stand up the Cursor-flavored sibling in
// the current working directory WITHOUT touching the OpenCode install.
// The two can coexist: Cursor reads `.cursor/`, OpenCode reads
// `~/.config/opencode/` or `.opencode/`.
//
// What this script does, in order:
//   1. Detects an existing attest-for-OpenCode install (checks for the
//      canonical markers install.sh places). Reports where it found
//      them. If no install is detected, warns but still proceeds — the
//      Cursor target is useful standalone.
//   2. Shells out to `node scripts/build-target-cursor.mjs --write
//      --out <cwd>/.cursor` using the attest checkout this script lives
//      in. The build target reads canonical sources + per-target drop /
//      keep sets and generates the full `.cursor/` tree (rules, skills,
//      hooks, mcp.json, README).
//   3. Writes `<cwd>/.cursor/MIGRATION_NOTES.md` with:
//      - what was ported (rules, skills, hooks, MCP servers)
//      - what was intentionally dropped (resume-anchor, compact agents,
//        tier detection, OpenCode-only tools and plugins)
//      - what to configure next (CURSOR_API_KEY for the conductor BDK,
//        MCP servers the user may want to enable at user scope)
//   4. In --dry-run mode: enumerates the migration plan and prints the
//      files that would land, but writes nothing. Safe to run against
//      any directory.
//
// Explicit non-goals:
//   - Does NOT modify or uninstall the user's existing OpenCode install.
//     Both targets coexist by design (different directories: `.cursor/`
//     vs `~/.config/opencode/` vs `.opencode/`).
//   - Does NOT modify .cursor/* if the user has committed hand edits
//     there — the build target writes the generated tree atomically,
//     but local hand edits would be overwritten. --dry-run surfaces
//     any such files BEFORE the write so the user can decide.
//
// Usage:
//   node scripts/migrate-opencode-to-cursor.mjs              # live write
//   node scripts/migrate-opencode-to-cursor.mjs --dry-run    # plan only
//   node scripts/migrate-opencode-to-cursor.mjs --cwd <dir>  # target dir
//   node scripts/migrate-opencode-to-cursor.mjs --help
//
// Also wired as the top-level npm script `migrate:to-cursor`:
//   npm run migrate:to-cursor
//   npm run migrate:to-cursor -- --dry-run

import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

// Repo this script lives in (the attest checkout).
const ATTEST_ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));

// ── argv parsing ────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const WANT_HELP = argv.includes('--help') || argv.includes('-h');
const DRY_RUN = argv.includes('--dry-run') || argv.includes('-n');
const CWD = (() => {
  const i = argv.indexOf('--cwd');
  if (i !== -1) return resolve(argv[i + 1]);
  return process.cwd();
})();

if (WANT_HELP) {
  process.stdout.write(
    [
      'migrate-opencode-to-cursor.mjs — stand up a Cursor-flavored attest tree',
      'alongside an existing OpenCode install, without touching OpenCode.',
      '',
      'Usage:',
      '  node scripts/migrate-opencode-to-cursor.mjs [--dry-run] [--cwd <dir>]',
      '',
      'Flags:',
      '  --dry-run, -n    Show the migration plan; write nothing.',
      '  --cwd <dir>      Target directory for .cursor/ (default: $PWD).',
      '  --help, -h       Show this help.',
      '',
      'What it does:',
      '  1. Detects the OpenCode install (~/.config/opencode/, .opencode/).',
      '  2. Runs scripts/build-target-cursor.mjs --write --out <cwd>/.cursor.',
      '  3. Writes <cwd>/.cursor/MIGRATION_NOTES.md.',
      '',
      'Coexistence:',
      '  Does NOT modify or uninstall the OpenCode install. The two targets',
      '  live in different directories and can be used side by side.',
      '',
    ].join('\n') + '\n',
  );
  process.exit(0);
}

// ── small output helpers ────────────────────────────────────────────────
function log(line) {
  process.stdout.write(line + '\n');
}
function warn(line) {
  process.stderr.write('[migrate] ' + line + '\n');
}

// ── install detection ───────────────────────────────────────────────────

// install.sh writes:
//   Global mode (DEST=~/.config/opencode):
//     - DEST/agents/           (always)
//     - DEST/skills/           (always)
//     - DEST/scripts/          (always)
//     - DEST/experts-version   (global mode only; the stamp file)
//     - DEST/.semgrep/         (if semgrep rules copied)
//   Project mode (DEST=.opencode):
//     - DEST/agents/, DEST/skills/, DEST/scripts/
//     - NO experts-version (installer skips the stamp in project mode)
//
// We treat ANY of these as a positive detection and report every match
// so the user sees what we found.
function detectOpencodeInstalls() {
  const found = [];

  const globalDir = join(homedir(), '.config', 'opencode');
  const globalMarkers = [
    'agents',
    'skills',
    'experts-version',
    'scripts',
  ];
  const globalHits = globalMarkers.filter((m) => existsSync(join(globalDir, m)));
  if (globalHits.length) {
    const stampPath = join(globalDir, 'experts-version');
    const stamp = existsSync(stampPath)
      ? readFileSync(stampPath, 'utf8').trim()
      : null;
    found.push({
      mode: 'global',
      path: globalDir,
      markers: globalHits,
      version: stamp,
    });
  }

  // Project-mode install may live at the current cwd OR anywhere the user
  // runs this script from (we check cwd, not a search path, by design).
  const projectDir = join(CWD, '.opencode');
  const projectMarkers = ['agents', 'skills', 'scripts'];
  const projectHits = projectMarkers.filter((m) =>
    existsSync(join(projectDir, m)),
  );
  if (projectHits.length) {
    found.push({
      mode: 'project',
      path: projectDir,
      markers: projectHits,
      version: null, // installer does not write a stamp in project mode
    });
  }

  return found;
}

// ── migration ──────────────────────────────────────────────────────────

function assertCursorBuildTargetAvailable() {
  const p = join(ATTEST_ROOT, 'scripts', 'build-target-cursor.mjs');
  if (existsSync(p)) return p;
  warn(
    'scripts/build-target-cursor.mjs is MISSING in this attest checkout at ' +
      ATTEST_ROOT +
      '.',
  );
  warn(
    'That script is landed by PR #1 (feat: Cursor build target) and the ' +
      'integration PR #5. Make sure your checkout is on a branch that ' +
      'includes it (e.g. `git checkout feat/cursor-build-target` or the ' +
      'integration branch after it merges to main).',
  );
  process.exit(1);
}

// ── enumerate what the build target would write ────────────────────────
// Used for --dry-run display. We ask the build target what it would
// write by running it against a sacrificial temp output and parsing the
// GENERATED_FILES.txt manifest it emits — but to avoid building twice
// in live mode, we do the live build directly in --write mode and only
// use the dry-run path when --dry-run is set.
function dryRunPlan(buildTargetPath, cursorOut) {
  // Run build-target-cursor into a temp dir and read its manifest. We
  // use the OS temp dir to be safe on read-only mounts in the real cwd.
  const tmp = mkdtempSync(join(tmpdir(), 'migrate-opencode-'));
  try {
    const r = spawnSync(
      process.execPath,
      [buildTargetPath, '--write', '--out', tmp],
      { stdio: 'pipe' },
    );
    if (r.status !== 0) {
      process.stderr.write(r.stdout?.toString() || '');
      process.stderr.write(r.stderr?.toString() || '');
      warn('dry-run build failed; see output above.');
      process.exit(1);
    }
    const manifest = readFileSync(join(tmp, 'GENERATED_FILES.txt'), 'utf8');
    const files = manifest
      .split('\n')
      .filter((l) => l && !l.startsWith('#'))
      .sort();
    return files;
  } finally {
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

function runBuildTargetWrite(buildTargetPath, cursorOut) {
  const r = spawnSync(
    process.execPath,
    [buildTargetPath, '--write', '--out', cursorOut],
    { stdio: 'inherit' },
  );
  if (r.status !== 0) {
    warn('build-target-cursor.mjs failed; see output above.');
    process.exit(r.status || 1);
  }
}

// ── MIGRATION_NOTES.md ──────────────────────────────────────────────────

function renderMigrationNotes({ installs, cursorOut, dryRun, generatedCount }) {
  const now = new Date().toISOString();
  const installsBlock = installs.length
    ? installs
        .map(
          (i) =>
            `- **${i.mode}**: \`${i.path}\`` +
            (i.version ? ` (v${i.version})` : '') +
            (i.markers.length ? ` — markers: ${i.markers.join(', ')}` : ''),
        )
        .join('\n')
    : '- (no attest-for-OpenCode install detected on this machine or in this cwd — Cursor target is standalone)';

  return `# attest-for-Cursor — migration notes

Generated by \`scripts/migrate-opencode-to-cursor.mjs\` on ${now}.
Target: \`${cursorOut}\`
${dryRun ? 'Mode: **DRY RUN** (no files written outside this notes file).' : `Mode: live write (${generatedCount} files generated).`}

## Where this came from

The migration script ran against an attest checkout at
\`${ATTEST_ROOT}\` and detected the following existing
attest-for-OpenCode install(s):

${installsBlock}

The OpenCode install was NOT modified. The two targets live in different
directories and coexist: Cursor reads \`.cursor/\`, OpenCode reads
\`~/.config/opencode/\` (or \`.opencode/\`). Uninstalling either does
not affect the other.

## What was ported

The Cursor target is a **thin editor-time veneer** that keeps the
high-value hooks, rules, and MCP wiring, and drops OpenCode-specific
mechanics that have no clean Cursor analog. In broad strokes:

| Surface | Shape in Cursor |
|---|---|
| \`.cursor/rules/*.mdc\` | On-demand rules with \`@file\` pointers at \`agents/shared/*.md\` (CHALLENGER, FIX_VERIFY, GATE_SCORING, PERSISTENCE, SCOPE_BOUNDARY, …). The agent reads them only when the \`description\` matches the current task. |
| \`.cursor/skills/\` | **Technique / procedure** skills only (\`/explore\`, \`/pre-code\`, \`/simplify\`, \`/gate\`, \`/goal\`, \`/wave\`, \`/reflow\`, \`/api-ground\`, \`/vault\`, …) plus the hand-authored \`/invoke-attest-conductor\` that teaches the local Cursor Agent to dial out to the \`attest-conductor\` BDK agent. The persona wrappers (\`/security\`, \`/code\`, \`/sdlc\`, …) are intentionally **not** generated here — see "What was dropped" below. |
| \`.cursor/hooks.json\` + \`.cursor/hooks/*.sh\` | 1:1 port of \`plugins/expert-hooks.ts\`: dangerous-bash blocker (\`beforeShellExecution\`), credential-write blocker (\`preToolUse\`), afterFileEdit lint/typecheck/secret-scan, telemetry (\`postToolUse\`), stop phase-gate (\`stop\`). Plus \`sessionStart\` STATE.md injection (**local only** — Cursor cloud agents do not fire \`sessionStart\`). |
| \`.cursor/mcp.json\` | Points at \`attest-mcp\` (the stdio MCP server that exposes the validators + phase gate + routing) and \`attest-conductor\` (the BDK agent that owns the Ralph loop). |
| \`.cursor/README.md\` | Short architecture note — read it first; it links the design report. |

## What was intentionally dropped

| OpenCode piece | Why it was dropped on Cursor |
|---|---|
| \`plugins/resume-anchor.ts\` | OpenCode-specific experimental \`chat.system.transform\` API that re-injected disk state on every request. Cursor's 200 k–1 M context models + its own summarization UX do not have the compaction / small-model failure mode this patched. The sessionStart \`inject-state.sh\` hook is the small, cheap replacement — local only. |
| \`dist/compact-agents/\` + the \`--compact\` install flag | Compact agent variants were for 32 k local LM Studio / Ollama models; every Cursor-selectable model is frontier (200 k+). Shipping compact variants would strip reasoning the agent benefits from. |
| \`scripts/detect-model-context.sh\` + \`docs/work/.model-context\` tier split | Tier detection probes LM Studio for a loaded model and context window; irrelevant on Cursor. |
| \`tools/task.ts\` (subprocess dispatcher spawning \`opencode run --agent\`) | Cursor's Task tool is the native dispatcher; the subprocess wrapper is unneeded. |
| \`tools/write.ts\` / \`append.ts\` / \`update.ts\` (atomic-write patches) | Workarounds for an LM-Studio-plus-OpenCode write bug Cursor does not have. The standard Edit / Write tools are used directly. |
| Persona-wrapper skills (\`/security\`, \`/code\`, \`/sdlc\`, \`/review\`, \`/autopilot\`, …) | Orchestrator-first architecture: personas live as deployable BDK agents in \`attest-experts\`, invoked by \`attest-conductor\`. The local Cursor Agent calls out via \`/invoke-attest-conductor\` rather than hosting the personas itself. |
| OpenCode-tier-specific protocols (\`agents/shared/LOCAL_LLM_PRIMER.md\`, \`MODEL_ADAPTER.md\`, \`CONTEXT_BUDGET.md\`, \`EXECUTOR_SELECTION.md\`) | Only exist to shore up small / 32 k local models and the 4-executor matrix; neither applies on Cursor's single-agent-with-subagents surface. |

Full keep / drop rationale lives in \`scripts/build-target-cursor.mjs\`
and the design report at
\`docs/attest-cursor-integration.md\`.

## What to configure next

1. **Install Cursor** (<https://cursor.com>) and open this directory as a
   project. Cursor picks up \`.cursor/rules/\`, \`.cursor/skills/\`,
   \`.cursor/hooks.json\`, and \`.cursor/mcp.json\` automatically.

2. **CURSOR_API_KEY** — required to drive the conductor BDK agent
   (\`attest-conductor\`) on your machine or in a hosted
   deployment. Set either:
      - the environment variable \`CURSOR_API_KEY=<key>\`, OR
      - a login session via \`npx @cursor/bdk login\`, OR
      - \`CURSOR_API_KEY_FILE=<path>\` pointing at a file that holds the
        key.
   Without one of these, the \`/invoke-attest-conductor\` skill falls
   back to its Option 2 (HTTPS endpoint) and Option 3 (GitHub comment)
   paths — see the skill body for details.

3. **MCP servers to enable** (choose the subset you want available at
   editor time; this is a **user-scope** decision, not a project-scope
   one):
      - \`attest\` — required. The stdio MCP server that exposes attest's
        77 validators as \`validate_<id>\` tools, plus \`phase_gate_check\`,
        \`route_goal\`, \`list_experts\`. Already registered in
        \`.cursor/mcp.json\`; no action needed unless you want to pin a
        specific version.
      - \`attest-conductor\` — required for \`/autopilot\` and multi-expert
        flows. Pre-registered to run \`@cursor/bdk serve --dir
        ./packages/attest-conductor\` locally; swap for an HTTP MCP
        transport pointing at the deployed BDK URL in hosted installs.
      - \`context7\` (\`@upstash/context7-mcp\`), \`playwright-search\`
        (quarry), \`mempalace\`, \`code-search\` — your OpenCode install
        registers these; they are **deliberately not** copied into
        \`.cursor/mcp.json\` (project scope) because Cursor's convention
        is to wire these at **user scope** in \`~/.cursor/mcp.json\`.
        Copy any you want from your \`~/.config/opencode/opencode.json\`
        → \`mcp.*\` into \`~/.cursor/mcp.json\` → \`mcpServers.*\`.

4. **STATE.md discipline** (optional). The \`sessionStart\` hook injects
   \`docs/work/STATE.md\` into \`additional_context\` when the file
   exists. If you were already writing it on OpenCode via the SDLC
   phases, nothing changes — the file lives in \`docs/work/\` on both
   sides. On Cursor cloud agents this hook does not fire, so STATE
   restoration is local-only.

5. **(Optional) uninstall OpenCode**. The two installs are independent;
   if you want to remove the OpenCode side later, run
   \`~/.config/opencode/scripts/\` (or \`uninstall.sh\` from your attest
   checkout) with the OpenCode-side flags. Running it does **not**
   touch \`.cursor/\`.

## Regenerating this tree

The \`.cursor/\` tree is generated — do not edit any file under it by
hand. To re-apply the latest attest sources:

\`\`\`sh
# From your attest checkout:
node scripts/build-target-cursor.mjs --write --out ${JSON.stringify(cursorOut)}

# Or run the migration again (which calls the generator and refreshes
# this notes file):
npm run migrate:to-cursor
\`\`\`

## References

- \`scripts/build-target-cursor.mjs\` — the generator.
- \`scripts/target-parity.config.mjs\` — explicit per-target allowlists
  that the CI parity gate uses to catch OpenCode ↔ Cursor drift.
- \`docs/attest-cursor-integration.md\` — full design report (why
  orchestrator-first, what moved where, the 4-executor → 2-executor
  collapse).
- \`.cursor/README.md\` — short in-tree architecture note.
`;
}

// ── main ────────────────────────────────────────────────────────────────

function main() {
  log('[migrate] attest root:  ' + ATTEST_ROOT);
  log('[migrate] target cwd:   ' + CWD);
  log('[migrate] dry run:      ' + (DRY_RUN ? 'YES' : 'no'));

  const installs = detectOpencodeInstalls();
  if (installs.length === 0) {
    warn(
      'no attest-for-OpenCode install detected in ~/.config/opencode/ ' +
        'or ' + join(CWD, '.opencode') + '. The migration still writes ' +
        'the Cursor target — just not alongside anything.',
    );
  } else {
    log('[migrate] detected OpenCode install(s):');
    for (const i of installs) {
      log(
        '  - ' +
          i.mode +
          ' at ' +
          i.path +
          (i.version ? ' (v' + i.version + ')' : '') +
          ' — markers: ' +
          i.markers.join(', '),
      );
    }
  }

  const buildTargetPath = assertCursorBuildTargetAvailable();
  const cursorOut = join(CWD, '.cursor');

  // Light safety: in --dry-run mode, warn if .cursor/ already exists and
  // has files not part of what the generator would write. This lets the
  // user see "I have hand edits here" before they decide to --write.
  if (DRY_RUN) {
    const files = dryRunPlan(buildTargetPath, cursorOut);
    log('[migrate] (dry-run) ' + files.length + ' file(s) would be written to ' + cursorOut + ':');
    for (const f of files) log('  + ' + f);

    const existing = existsSync(cursorOut) ? walkRel(cursorOut) : new Set();
    const planned = new Set(files);
    const extraHere = [...existing].filter((f) => !planned.has(f));
    if (extraHere.length) {
      warn(
        extraHere.length +
          ' file(s) in ' +
          cursorOut +
          ' are NOT part of the plan (hand edits or stale from a prior tree?). ' +
          'A live --write would delete them. Review:',
      );
      for (const f of extraHere.sort()) warn('  - ' + f);
    }

    // Even in dry-run we still write the notes file, so the user has a
    // tangible artifact describing what would happen.
    const notesPath = join(cursorOut, 'MIGRATION_NOTES.md');
    const notes = renderMigrationNotes({
      installs,
      cursorOut,
      dryRun: true,
      generatedCount: files.length,
    });
    log(
      '[migrate] (dry-run) would also write MIGRATION_NOTES.md to ' + notesPath +
        ' — not actually writing it in --dry-run.',
    );
    log(
      '[migrate] (dry-run) notes preview (first 20 lines):\n' +
        notes.split('\n').slice(0, 20).map((l) => '    ' + l).join('\n'),
    );
    log('[migrate] (dry-run) OK — no files written.');
    return;
  }

  log('[migrate] running: node ' + relative(ATTEST_ROOT, buildTargetPath) + ' --write --out ' + cursorOut);
  runBuildTargetWrite(buildTargetPath, cursorOut);

  const generated = existsSync(join(cursorOut, 'GENERATED_FILES.txt'))
    ? readFileSync(join(cursorOut, 'GENERATED_FILES.txt'), 'utf8')
        .split('\n')
        .filter((l) => l && !l.startsWith('#')).length
    : 0;

  const notesPath = join(cursorOut, 'MIGRATION_NOTES.md');
  mkdirSync(dirname(notesPath), { recursive: true });
  writeFileSync(
    notesPath,
    renderMigrationNotes({
      installs,
      cursorOut,
      dryRun: false,
      generatedCount: generated,
    }),
  );
  log('[migrate] wrote ' + notesPath);
  log('[migrate] OK — Cursor target generated at ' + cursorOut + '.');
  log('[migrate] read ' + notesPath + ' for what to configure next.');
}

// ── helpers ─────────────────────────────────────────────────────────────

function walkRel(root) {
  const out = new Set();
  const stack = [root];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = readdirSync(cur);
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = join(cur, e);
      let st;
      try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) stack.push(p);
      else out.add(relative(root, p));
    }
  }
  return out;
}

main();
