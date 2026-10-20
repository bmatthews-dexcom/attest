#!/usr/bin/env node
// check-target-parity.mjs — OpenCode ↔ Cursor target parity gate.
//
// Asserts that the two generated targets (Claude = OpenCode-flavored,
// Cursor = editor-time veneer) agree on everything that should round-trip:
//
//   1. Skill set membership (minus known one-sided skips).
//   2. Rule set membership (minus intentional Cursor skips of
//      OpenCode-tier-specific protocols).
//   3. Hook event coverage (OpenCode plugin phases ↔ Cursor hook events).
//   4. MCP server list.
//
// Per-target expected diffs are declared in scripts/target-parity.config.mjs
// as explicit allowlists. Any difference the gate sees that is NOT listed
// there is drift and the gate fails the CI job.
//
// Usage:
//   node scripts/check-target-parity.mjs
//
// Design:
//   This script compares the two targets' EFFECTIVE sets — what each
//   target SHOULD emit given the committed source + its generator rules
//   — not the literal generated file trees. That decouples the parity
//   gate from any requirement that an attest-claude sibling be checked
//   out AND in sync (which can't be assumed on a feature-branch PR; it's
//   the exact reason the existing CI defers `build:claude:check` to
//   push-to-main). The two per-target :check scripts remain in charge of
//   "generator output matches each target's committed tree"; this script
//   is in charge of "the two generators agree on what they emit."
//
//   To rule out the generators being broken or out of sync with the
//   source, we also do a `--write` regeneration of both targets into
//   temp dirs as a smoke test before running the comparisons.
//
// Exit codes:
//   0 — in sync (or every delta is allowlisted).
//   1 — unlisted drift found; stdout lists the offending entries and
//       points at the config file.

import {
  readFileSync,
  existsSync,
  readdirSync,
  statSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  PERSONA_SKILL_DROPS,
  TECHNIQUE_SKILL_KEEPS,
  SHARED_RULE_SKIPS,
} from './build-target-cursor.mjs';

import {
  SKILL_PARITY_EXCEPTIONS,
  KNOWN_MISSING_IN_CLAUDE,
} from './build-target-claude.mjs';

import * as cfg from './target-parity.config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── small helpers ───────────────────────────────────────────────────────
function diff(a, b) {
  const onlyA = [...a].filter((x) => !b.has(x)).sort();
  const onlyB = [...b].filter((x) => !a.has(x)).sort();
  return { onlyA, onlyB };
}

function listSkillDirs(root) {
  const dir = join(root, 'skills');
  if (!existsSync(dir)) return new Set();
  const out = new Set();
  for (const e of readdirSync(dir)) {
    if (existsSync(join(dir, e, 'SKILL.md'))) out.add(e);
  }
  return out;
}

function listSourceSharedProtocols() {
  const dir = join(ROOT, 'agents/shared');
  if (!existsSync(dir)) return new Set();
  const out = new Set();
  for (const e of readdirSync(dir)) {
    if (!e.endsWith('.md')) continue;
    out.add(e);
  }
  return out;
}

function listCursorRuleSlugs(cursorRoot) {
  const dir = join(cursorRoot, 'rules');
  if (!existsSync(dir)) return new Set();
  const out = new Set();
  for (const e of readdirSync(dir)) {
    if (!e.endsWith('.mdc')) continue;
    out.add(e.replace(/\.mdc$/, ''));
  }
  return out;
}

function readCursorHookEvents(cursorRoot) {
  const p = join(cursorRoot, 'hooks.json');
  if (!existsSync(p)) return new Set();
  const data = JSON.parse(readFileSync(p, 'utf8'));
  return new Set(Object.keys(data.hooks || {}));
}

function readCursorMcpServers(cursorRoot) {
  const p = join(cursorRoot, 'mcp.json');
  if (!existsSync(p)) return new Set();
  const data = JSON.parse(readFileSync(p, 'utf8'));
  return new Set(Object.keys(data.mcpServers || {}));
}

function readOpencodeMcpServers() {
  const p = join(ROOT, 'examples', 'opencode.json');
  if (!existsSync(p)) return new Set();
  const data = JSON.parse(readFileSync(p, 'utf8'));
  return new Set(Object.keys(data.mcp || {}));
}

// Enumerate the OpenCode plugin markers that signal each hook phase lives
// in the source plugin. Each marker is a stable identifier for one branch
// of plugins/expert-hooks.ts — if a reviewer deletes a branch, the marker
// disappears and the parity gate flags the drift.
function readOpencodePluginMarkers() {
  const p = join(ROOT, 'plugins', 'expert-hooks.ts');
  if (!existsSync(p)) return new Set();
  const src = readFileSync(p, 'utf8');
  const out = new Set();
  if (/DANGEROUS_BASH/.test(src)) out.add('DANGEROUS_BASH');
  if (/BLOCKED_FILE_PATTERNS/.test(src)) out.add('BLOCKED_FILE_PATTERNS');
  if (/SECRET_PATTERNS/.test(src)) out.add('SECRET_PATTERNS');
  if (/telemetry\.jsonl/.test(src)) out.add('telemetry.jsonl');
  return out;
}

function runNode(args, label) {
  const r = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'pipe' });
  if (r.status !== 0) {
    process.stderr.write(r.stdout?.toString() || '');
    process.stderr.write(r.stderr?.toString() || '');
    throw new Error(`${label} failed with exit ${r.status}`);
  }
}

function kebab(s) {
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ── checks ──────────────────────────────────────────────────────────────

function checkConfigConsistency() {
  // Verify the config file mirrors the authoritative generator-exported
  // sets. Drift here means the config has decayed and reviewers can no
  // longer trust what it allows.
  const problems = [];

  const { onlyA: configOnly, onlyB: generatorOnly } = diff(
    cfg.skills.cursorOnlyDrops,
    PERSONA_SKILL_DROPS,
  );
  if (configOnly.length) {
    problems.push(
      `config.skills.cursorOnlyDrops has ${configOnly.length} entry/entries ` +
        `not in build-target-cursor.mjs → PERSONA_SKILL_DROPS: ${configOnly.join(', ')}`,
    );
  }
  if (generatorOnly.length) {
    problems.push(
      `build-target-cursor.mjs → PERSONA_SKILL_DROPS has ${generatorOnly.length} ` +
        `entry/entries not in config.skills.cursorOnlyDrops (add to ` +
        `scripts/target-parity.config.mjs with a one-line reason): ` +
        generatorOnly.join(', '),
    );
  }

  const { onlyA: skipOnlyCfg, onlyB: skipOnlyGen } = diff(
    cfg.rules.cursorOnlySkips,
    SHARED_RULE_SKIPS,
  );
  if (skipOnlyCfg.length || skipOnlyGen.length) {
    problems.push(
      `config.rules.cursorOnlySkips drifted from build-target-cursor.mjs → ` +
        `SHARED_RULE_SKIPS. ` +
        (skipOnlyCfg.length ? `Only in config: ${skipOnlyCfg.join(', ')}. ` : '') +
        (skipOnlyGen.length ? `Only in generator: ${skipOnlyGen.join(', ')}.` : ''),
    );
  }

  const { onlyA: cfgOnly, onlyB: genOnly } = diff(
    cfg.skills.claudeMissingFromOpencodeSource,
    KNOWN_MISSING_IN_CLAUDE,
  );
  if (cfgOnly.length || genOnly.length) {
    problems.push(
      `config.skills.claudeMissingFromOpencodeSource drifted from ` +
        `build-target-claude.mjs → KNOWN_MISSING_IN_CLAUDE. ` +
        (cfgOnly.length ? `Only in config: ${cfgOnly.join(', ')}. ` : '') +
        (genOnly.length ? `Only in generator: ${genOnly.join(', ')}.` : ''),
    );
  }

  return problems;
}

function checkSkills(cursorOut) {
  const problems = [];
  const sourceSkills = listSkillDirs(ROOT);

  // Compute each target's EFFECTIVE skill set from source + its generator
  // rules + the config's cross-target allowlists. These are the sets the
  // two targets would end up shipping once both targets had regenerated
  // and (for Claude) its hand-maintained skills had been ported.
  //
  //   Cursor effective = (source − cursorOnlyDrops) + cursorOnly
  //   Claude effective = (source − SKILL_PARITY_EXCEPTIONS − KNOWN_MISSING_IN_CLAUDE) + claudeOnly
  //
  // Parity: a skill present in one effective set but not the other must
  // appear in the matching cross-target allowlist (cursorOnly, claudeOnly,
  // cursorOnlyDrops, or SKILL_PARITY_EXCEPTIONS). Anything else is drift.
  const cursorEffective = new Set();
  for (const s of sourceSkills) {
    if (cfg.skills.cursorOnlyDrops.has(s)) continue;
    cursorEffective.add(s);
  }
  for (const s of cfg.skills.cursorOnly) cursorEffective.add(s);

  const claudeEffective = new Set();
  for (const s of sourceSkills) {
    if (SKILL_PARITY_EXCEPTIONS.has(s)) continue;
    if (KNOWN_MISSING_IN_CLAUDE.has(s)) continue;
    claudeEffective.add(s);
  }
  for (const s of cfg.skills.claudeOnly) claudeEffective.add(s);

  // Validate the Cursor target's effective set against the ACTUAL
  // committed .cursor/skills/ tree (which the build:cursor:check gate
  // already enforces matches the generator output). This catches a case
  // where someone edited the config but forgot to update the generator.
  const cursorActual = listSkillDirs(cursorOut);
  const { onlyA: cursorExpectedMissing, onlyB: cursorExtraReal } = diff(
    cursorEffective,
    cursorActual,
  );
  if (cursorExpectedMissing.length) {
    problems.push(
      `Cursor target expected but missing ${cursorExpectedMissing.length} ` +
        `skill(s): ${cursorExpectedMissing.join(', ')} ` +
        `(check build-target-cursor.mjs → TECHNIQUE_SKILL_KEEPS vs ` +
        `config.skills.cursorOnly / cursorOnlyDrops).`,
    );
  }
  if (cursorExtraReal.length) {
    problems.push(
      `Cursor target has ${cursorExtraReal.length} UNEXPECTED skill(s): ` +
        `${cursorExtraReal.join(', ')} ` +
        `(add to config.skills.cursorOnly or move out of ` +
        `build-target-cursor.mjs → TECHNIQUE_SKILL_KEEPS).`,
    );
  }

  // Cross-target: everything in one effective set but not the other must
  // be covered by an allowlist. By construction (above), the ONLY entries
  // on only-cursor are cursorOnly or (sourceSkills ∩ SKILL_PARITY_EXCEPTIONS)
  // (the latter is dropped on Claude but kept on Cursor by default). We
  // flag any one-sided skill that is not in a cross-target allowlist.
  const { onlyA: onlyCursor, onlyB: onlyClaude } = diff(
    cursorEffective,
    claudeEffective,
  );
  for (const s of onlyCursor) {
    if (cfg.skills.cursorOnly.has(s)) continue;
    if (SKILL_PARITY_EXCEPTIONS.has(s)) continue;
    if (KNOWN_MISSING_IN_CLAUDE.has(s)) continue;
    problems.push(
      `skill '${s}' is on Cursor but not Claude, and not allowlisted. ` +
        `Add it to build-target-claude.mjs → SKILL_PARITY_EXCEPTIONS or ` +
        `config.skills.cursorOnly with a reason, or port it to Claude.`,
    );
  }
  for (const s of onlyClaude) {
    if (cfg.skills.claudeOnly.has(s)) continue;
    if (cfg.skills.cursorOnlyDrops.has(s)) continue;
    problems.push(
      `skill '${s}' is on Claude but not Cursor, and not allowlisted. ` +
        `Add it to config.skills.cursorOnlyDrops or config.skills.claudeOnly ` +
        `with a reason, or port it to Cursor.`,
    );
  }

  // Sanity: no skill may appear in BOTH cursorOnly and claudeOnly.
  const bothSides = new Set(
    [...cfg.skills.cursorOnly].filter((s) => cfg.skills.claudeOnly.has(s)),
  );
  for (const s of bothSides) {
    problems.push(
      `config.skills: '${s}' appears in BOTH cursorOnly and claudeOnly — pick one.`,
    );
  }

  // TECHNIQUE_SKILL_KEEPS must be a subset of source skills.
  for (const s of TECHNIQUE_SKILL_KEEPS) {
    if (!sourceSkills.has(s)) {
      problems.push(
        `TECHNIQUE_SKILL_KEEPS lists '${s}' but there is no source skills/${s}/SKILL.md`,
      );
    }
  }

  return {
    problems,
    summary: {
      source: sourceSkills.size,
      cursorEffective: cursorEffective.size,
      claudeEffective: claudeEffective.size,
      cursorActualEmitted: cursorActual.size,
      cursorOnly: cfg.skills.cursorOnly.size,
      claudeOnly: cfg.skills.claudeOnly.size,
      cursorOnlyDrops: cfg.skills.cursorOnlyDrops.size,
      sharedBothEffective: [...cursorEffective].filter((s) =>
        claudeEffective.has(s),
      ).length,
    },
  };
}

function checkRules(cursorOut) {
  const problems = [];
  const sourceShared = listSourceSharedProtocols();
  const cursorRules = listCursorRuleSlugs(cursorOut);

  // Each shared-protocol file (minus SHARED_RULE_SKIPS) must emit a Cursor
  // rule under `shared-<kebab(name)>`. Each file in cfg.rules.cursorOnlyAdds
  // must also appear.
  const expected = new Set();
  for (const name of sourceShared) {
    if (SHARED_RULE_SKIPS.has(name)) continue;
    expected.add('shared-' + kebab(name.replace(/\.md$/, '')));
  }
  for (const extra of cfg.rules.cursorOnlyAdds) expected.add(extra);

  const { onlyA: missing, onlyB: extra } = diff(expected, cursorRules);
  if (missing.length) {
    problems.push(
      `Cursor target MISSING ${missing.length} expected rule(s): ${missing.join(', ')}`,
    );
  }
  if (extra.length) {
    problems.push(
      `Cursor target has ${extra.length} UNEXPECTED rule(s) ` +
        `(add to config.rules.cursorOnlyAdds with a reason, or extend ` +
        `build-target-cursor.mjs → SHARED_RULE_SKIPS): ${extra.join(', ')}`,
    );
  }

  return {
    problems,
    summary: {
      sourceShared: sourceShared.size,
      cursorRules: cursorRules.size,
      cursorOnlySkips: cfg.rules.cursorOnlySkips.size,
    },
  };
}

function checkHooks(cursorOut) {
  const problems = [];
  const opencodeMarkers = readOpencodePluginMarkers();
  const cursorEvents = readCursorHookEvents(cursorOut);

  for (const row of cfg.hooks.mapping) {
    if (!opencodeMarkers.has(row.opencodeMarker)) {
      problems.push(
        `hook mapping '${row.purpose}' expects OpenCode marker ` +
          `'${row.opencodeMarker}' in plugins/expert-hooks.ts but it is ` +
          `missing — either the plugin dropped it or the config is stale.`,
      );
    }
    if (!cursorEvents.has(row.cursorEvent)) {
      problems.push(
        `hook mapping '${row.purpose}' expects Cursor event ` +
          `'${row.cursorEvent}' in .cursor/hooks.json but it is missing — ` +
          `either build-target-cursor.mjs → generateHooks() dropped it or ` +
          `the config is stale.`,
      );
    }
  }

  const mappedCursorEvents = new Set(cfg.hooks.mapping.map((r) => r.cursorEvent));
  for (const ev of cursorEvents) {
    if (mappedCursorEvents.has(ev)) continue;
    if (cfg.hooks.cursorOnlyEvents.has(ev)) continue;
    problems.push(
      `Cursor hooks.json has event '${ev}' that is neither mapped to an ` +
        `OpenCode phase nor in config.hooks.cursorOnlyEvents.`,
    );
  }

  return {
    problems,
    summary: {
      opencodeMarkers: opencodeMarkers.size,
      cursorEvents: cursorEvents.size,
      mappings: cfg.hooks.mapping.length,
      cursorOnlyEvents: cfg.hooks.cursorOnlyEvents.size,
    },
  };
}

function checkMcp(cursorOut) {
  const problems = [];
  const warnings = [];
  const opencodeServers = readOpencodeMcpServers();
  const cursorServers = readCursorMcpServers(cursorOut);

  for (const required of cfg.mcp.requiredBoth) {
    if (!opencodeServers.has(required)) {
      problems.push(
        `MCP server '${required}' is in config.mcp.requiredBoth but ` +
          `missing from examples/opencode.json → mcp.`,
      );
    }
    if (!cursorServers.has(required)) {
      problems.push(
        `MCP server '${required}' is in config.mcp.requiredBoth but ` +
          `missing from .cursor/mcp.json → mcpServers.`,
      );
    }
  }

  for (const name of cfg.mcp.cursorOnly) {
    if (!cursorServers.has(name)) {
      problems.push(
        `MCP server '${name}' is listed in config.mcp.cursorOnly but ` +
          `missing from .cursor/mcp.json.`,
      );
    }
    if (opencodeServers.has(name) && !cfg.mcp.pending.has(name)) {
      problems.push(
        `MCP server '${name}' is listed in config.mcp.cursorOnly but ` +
          `IS present in examples/opencode.json — move it to ` +
          `config.mcp.requiredBoth or remove it from one side.`,
      );
    }
  }
  for (const name of cfg.mcp.opencodeOnly) {
    if (!opencodeServers.has(name)) {
      problems.push(
        `MCP server '${name}' is listed in config.mcp.opencodeOnly but ` +
          `missing from examples/opencode.json → mcp.`,
      );
    }
    if (cursorServers.has(name)) {
      problems.push(
        `MCP server '${name}' is listed in config.mcp.opencodeOnly but ` +
          `IS present in .cursor/mcp.json — either move it to ` +
          `config.mcp.requiredBoth or remove it from one side.`,
      );
    }
  }

  const classified = new Set([
    ...cfg.mcp.requiredBoth,
    ...cfg.mcp.cursorOnly,
    ...cfg.mcp.opencodeOnly,
  ]);
  for (const name of cursorServers) {
    if (!classified.has(name)) {
      problems.push(
        `MCP server '${name}' in .cursor/mcp.json is unclassified. ` +
          `Add it to config.mcp.{requiredBoth|cursorOnly} with a reason.`,
      );
    }
  }
  for (const name of opencodeServers) {
    if (!classified.has(name)) {
      problems.push(
        `MCP server '${name}' in examples/opencode.json is unclassified. ` +
          `Add it to config.mcp.{requiredBoth|opencodeOnly} with a reason.`,
      );
    }
  }

  for (const [name, reason] of cfg.mcp.pending) {
    warnings.push(`MCP server '${name}' pending migration: ${reason}`);
  }

  return {
    problems,
    warnings,
    summary: {
      opencodeServers: opencodeServers.size,
      cursorServers: cursorServers.size,
      requiredBoth: cfg.mcp.requiredBoth.size,
      cursorOnly: cfg.mcp.cursorOnly.size,
      opencodeOnly: cfg.mcp.opencodeOnly.size,
    },
  };
}

// ── main ────────────────────────────────────────────────────────────────

function main() {
  console.log('[parity] regenerating both targets into temp dirs (smoke test)…');
  const tmpClaude = mkdtempSync(join(tmpdir(), 'parity-claude-'));
  const tmpCursor = mkdtempSync(join(tmpdir(), 'parity-cursor-'));

  const cleanup = () => {
    try { rmSync(tmpClaude, { recursive: true, force: true }); } catch { /* ignore */ }
    try { rmSync(tmpCursor, { recursive: true, force: true }); } catch { /* ignore */ }
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(130); });

  try {
    runNode(
      ['scripts/build-target-claude.mjs', '--write', '--out', tmpClaude],
      'build-target-claude.mjs --write',
    );
    runNode(
      ['scripts/build-target-cursor.mjs', '--write', '--out', tmpCursor],
      'build-target-cursor.mjs --write',
    );
  } catch (err) {
    console.error(`[parity] regeneration failed: ${err.message}`);
    process.exit(1);
  }

  // All target-specific validation operates on the freshly-regenerated
  // Cursor tree (tmpCursor). The Claude target is regenerated above as a
  // smoke test — its skills are hand-maintained in the sibling
  // attest-claude repo, so the parity gate reads intent from the
  // generator exports (SKILL_PARITY_EXCEPTIONS, KNOWN_MISSING_IN_CLAUDE)
  // rather than from a tree, and does the cross-target comparison on
  // effective (computed) sets.
  const configProblems = checkConfigConsistency();
  const { problems: skillProblems, summary: skillSummary } =
    checkSkills(tmpCursor);
  const { problems: ruleProblems, summary: ruleSummary } =
    checkRules(tmpCursor);
  const { problems: hookProblems, summary: hookSummary } =
    checkHooks(tmpCursor);
  const {
    problems: mcpProblems,
    warnings: mcpWarnings,
    summary: mcpSummary,
  } = checkMcp(tmpCursor);

  const sections = [
    ['config consistency', configProblems],
    ['skills', skillProblems],
    ['rules', ruleProblems],
    ['hooks', hookProblems],
    ['mcp', mcpProblems],
  ];

  let totalProblems = 0;
  for (const [name, problems] of sections) {
    if (problems.length === 0) continue;
    totalProblems += problems.length;
    console.log(`\n[parity] ${name} — ${problems.length} problem(s):`);
    for (const p of problems) console.log(`  ✗ ${p}`);
  }

  if (mcpWarnings?.length) {
    console.log(`\n[parity] mcp — ${mcpWarnings.length} warning(s) (non-fatal):`);
    for (const w of mcpWarnings) console.log(`  ⚠ ${w}`);
  }

  console.log('\n[parity] summary:');
  console.log(
    `  skills: ${skillSummary.cursorEffective}/${skillSummary.source} on Cursor ` +
      `(${skillSummary.cursorActualEmitted} actually emitted), ` +
      `${skillSummary.claudeEffective}/${skillSummary.source} on Claude; ` +
      `${skillSummary.sharedBothEffective} on both; ` +
      `cursor-only=${skillSummary.cursorOnly}, claude-only=${skillSummary.claudeOnly}, ` +
      `cursor-drops=${skillSummary.cursorOnlyDrops}`,
  );
  console.log(
    `  rules:  ${ruleSummary.cursorRules} cursor rule(s) from ` +
      `${ruleSummary.sourceShared} shared protocol(s) ` +
      `(${ruleSummary.cursorOnlySkips} intentional skip(s))`,
  );
  console.log(
    `  hooks:  ${hookSummary.cursorEvents} cursor event(s) covering ` +
      `${hookSummary.mappings} mapping(s) + ${hookSummary.cursorOnlyEvents} ` +
      `cursor-only event(s); ${hookSummary.opencodeMarkers} opencode marker(s)`,
  );
  console.log(
    `  mcp:    ${mcpSummary.cursorServers} cursor + ${mcpSummary.opencodeServers} ` +
      `opencode server(s) ` +
      `(req-both=${mcpSummary.requiredBoth}, cursor-only=${mcpSummary.cursorOnly}, ` +
      `opencode-only=${mcpSummary.opencodeOnly})`,
  );

  if (totalProblems > 0) {
    console.log(
      `\n[parity] FAIL — ${totalProblems} unlisted drift(s). ` +
        `Edit scripts/target-parity.config.mjs to allowlist intentional ` +
        `asymmetries, or fix the generator / source so both targets agree.`,
    );
    process.exit(1);
  }

  console.log('\n[parity] OK — both targets agree on every allowlisted set.');
}

main();
