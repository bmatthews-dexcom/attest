// target-parity.config.mjs — explicit per-target expected diffs for the
// OpenCode↔Cursor parity gate (scripts/check-target-parity.mjs).
//
// Each allowlist is an INTENTIONAL per-target asymmetry. Anything the
// parity gate finds that is NOT listed here is treated as drift and
// fails the gate. Extend an allowlist (with a one-line reason) when a
// new asymmetry is approved — the goal is that no divergence lands
// without a reviewer-visible edit to this file.
//
// The parity gate reads this file alongside the authoritative constants
// exported by the two build-target scripts. Those scripts remain the
// single source of truth for WHAT each target emits; this file records
// WHICH of those emissions is a deliberate per-target difference.
//
// Extending the allowlist (reviewer checklist):
//   1. Add the entry to the right set below with a one-line comment.
//   2. Make sure the entry name matches what the generator writes
//      (skill directory name, shared-protocol basename, hook event,
//      MCP server key).
//   3. Run `node scripts/check-target-parity.mjs` locally — the gate
//      should turn green after the edit.
//   4. In the PR body, name the asymmetry and link to this file.
//
// To run the parity gate locally:
//   node scripts/check-target-parity.mjs
//
// It regenerates both targets into temp dirs and compares them, so no
// sibling attest-claude checkout is required.

export const skills = {
  // Skills that are emitted on Cursor but NOT on OpenCode / Claude.
  // Hand-authored additions that only make sense on Cursor.
  cursorOnly: new Set([
    // Teaches the local Cursor Agent to call out to attest-conductor
    // (BDK) because the orchestrator-first architecture keeps the personas
    // off the local editor surface. See .cursor/skills/invoke-attest-conductor/.
    'invoke-attest-conductor',
    // Shape-C sdlc-lead chief skill — the orchestrator-first SDLC chief
    // persona rendered as an editor-side front door. Lives only on the
    // Cursor target; the OpenCode target routes SDLC work through
    // conventional persona skills instead.
    'sdlc-lead',
    // Phase-1 attest-ceo chief skill (PR #16) — product-level CEO
    // persona rendered as an editor-side front door. Cursor-only; the
    // CEO's authoritative chief persona runs as a BDK agent on the
    // deployed side.
    'attest-ceo',
    // Phase-1 attest-director chief skill (PR #17) — operations
    // director persona rendered as an editor-side front door. Cursor-only
    // for the same reason as attest-ceo.
    'director',
  ]),

  // Skills emitted on OpenCode (and Claude) but intentionally dropped on
  // Cursor. These are the persona wrappers + orchestration entry points
  // that live as BDK agents in attest-experts in the Cursor
  // target. Must stay 1:1 with build-target-cursor.mjs → PERSONA_SKILL_DROPS.
  //
  // The parity gate cross-checks this list against the authoritative
  // PERSONA_SKILL_DROPS export: if the two drift, the gate fails with a
  // clear message pointing at this file.
  cursorOnlyDrops: new Set([
    // Persona-wrapper pattern — body says "Load and follow the instructions
    // in the `<agent>` agent".
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
    // Orchestration entry points — autopilot IS the conductor loop,
    // review coordinates three personas. Replaced by invoke-attest-conductor.
    'autopilot',
    'review',
    // sdlc-lead sub-steps — ship with the parent coordinator in BDK.
    'onboard-gap-fill',
    'onboard-inventory',
    'onboard-verify',
    // Persona-in-disguise (invokes `ui-verifier`).
    'ui-verify',
    // Explicitly scoped placeholder per its own description.
    'user-guide',
    // Project-intelligence persona.
    'steward',
  ]),

  // Skills intentionally one-sided on the Claude target — kept here as an
  // explicit list for reviewer visibility; cross-checked against the
  // authoritative SKILL_PARITY_EXCEPTIONS and KNOWN_MISSING_IN_CLAUDE
  // exports from build-target-claude.mjs.
  claudeOnly: new Set([
    // Claude-only MCP cheat sheet — attest-claude ships a `memory` skill
    // whose body is entirely claude-memory MCP examples. No OpenCode-side
    // equivalent slash trigger (cited in build-target-claude.mjs
    // SKILL_PARITY_EXCEPTIONS).
    'memory',
  ]),

  // Skills that live in OpenCode source but have no Claude mapping yet
  // (tracked follow-up; mirrors KNOWN_MISSING_IN_CLAUDE). The parity gate
  // tolerates these on the OpenCode side but still flags them if the
  // Claude generator exports change out from under us.
  claudeMissingFromOpencodeSource: new Set([
    'wave',
    'goal',
    'autopilot',
  ]),
};

export const rules = {
  // Shared protocols (agents/shared/*.md) that intentionally do NOT emit
  // a Cursor rule. OpenCode-tier-specific — frontier models don't need
  // them. Must stay 1:1 with build-target-cursor.mjs → SHARED_RULE_SKIPS.
  cursorOnlySkips: new Set([
    'LOCAL_LLM_PRIMER.md',
    'MODEL_ADAPTER.md',
    'CONTEXT_BUDGET.md',
    // 4-executor matrix (A/B/C/D) collapses to Task+inline on Cursor;
    // the raw document would mislead.
    'EXECUTOR_SELECTION.md',
  ]),

  // Rules present on Cursor but NOT derived from a source shared-protocol
  // file. These are hand-authored or come from the `rules/` directory.
  cursorOnlyAdds: new Set([
    // From rules/ directory (not agents/shared/).
    'validator-house-style',
    'agents-shared-blocks',
  ]),
};

export const hooks = {
  // The expected OpenCode plugin phase → Cursor hook event mapping. The
  // parity gate reads the OpenCode source (plugins/expert-hooks.ts) and
  // the Cursor generated hooks.json, and verifies each mapping is
  // present on BOTH sides. A missing entry on either side is drift.
  //
  // Keys are a stable logical label for the hook's PURPOSE (not the
  // literal OpenCode phase + handler pair, which would be brittle); the
  // parity gate matches the OpenCode source by regex on the handler
  // name, and the Cursor output by the hook event key.
  mapping: [
    // Dangerous-bash blocker — OpenCode tool.execute.before (bash matcher)
    // → Cursor beforeShellExecution.
    { purpose: 'block-dangerous-bash',
      opencodePhase: 'tool.execute.before',
      opencodeMarker: 'DANGEROUS_BASH',
      cursorEvent: 'beforeShellExecution',
      cursorScript: 'block-dangerous.sh' },

    // Credential-write blocker — OpenCode tool.execute.before (write/edit)
    // → Cursor preToolUse with Write/Edit matcher.
    { purpose: 'block-credential-writes',
      opencodePhase: 'tool.execute.before',
      opencodeMarker: 'BLOCKED_FILE_PATTERNS',
      cursorEvent: 'preToolUse',
      cursorScript: 'block-credentials.sh' },

    // Post-edit format/lint/typecheck/secret-scan — OpenCode
    // tool.execute.after → Cursor afterFileEdit.
    { purpose: 'post-edit-check',
      opencodePhase: 'tool.execute.after',
      opencodeMarker: 'SECRET_PATTERNS',
      cursorEvent: 'afterFileEdit',
      cursorScript: 'post-edit-check.sh' },

    // Telemetry row per completed tool call — OpenCode event (session)
    // → Cursor postToolUse.
    { purpose: 'telemetry',
      opencodePhase: 'event',
      opencodeMarker: 'telemetry.jsonl',
      cursorEvent: 'postToolUse',
      cursorScript: 'telemetry.sh' },
  ],

  // Cursor hook events that have no OpenCode analog (intentional). These
  // are universally local-only additions.
  cursorOnlyEvents: new Set([
    // Replaces plugins/resume-anchor.ts — Cursor equivalent only; the
    // OpenCode-side experimental.chat.system.transform API has no Cursor
    // mapping (per the design report §6 "Hooks layer").
    'sessionStart',
    // Phase-gate run on end-of-turn — Cursor-side wrapper around
    // scripts/validators/run-coverage-loop.sh. No OpenCode plugin phase
    // for stop; attest's OpenCode-side gate wiring is skill-based.
    'stop',
  ]),

  // OpenCode plugin phases we intentionally do NOT port to Cursor
  // (declared drops, not drift). Keep each entry with a one-line reason.
  opencodeOnly: new Map([
    [
      'session.first-assistant-message/session-model-receipt',
      "Cursor exposes the running model directly via hook payload; the " +
        "'opus ran silently and nobody knew' guard this receipts for is " +
        "already visible without a separate receipt JSONL.",
    ],
  ]),
};

export const mcp = {
  // MCP servers required on BOTH targets. Both the OpenCode
  // examples/opencode.json and the Cursor .cursor/mcp.json must register
  // every server listed here. Drift (one side missing) fails the gate.
  requiredBoth: new Set([
    // The attest MCP server (attest-mcp) — the authoritative
    // bridge for validators + phase_gate + route_goal + list_experts. The
    // integration-PR tip registers it under the key `attest` on both
    // targets. (OpenCode's current examples/opencode.json has not been
    // updated yet; see opencodeOnly below for the pre-integration list
    // that still ships. Once that PR lands, the key will appear here.)
    //
    // Removed from requiredBoth until the OpenCode examples config
    // registers `attest` — the parity gate must not fail on a known-
    // in-progress rollout. See mcp.pending below.
  ]),

  // MCP servers that are intentionally only on the Cursor side.
  cursorOnly: new Set([
    // The BDK orchestrator lives in-tree as packages/attest-conductor
    // and is served locally via `@cursor/bdk serve --mode single`.
    // Deployed Cursor installs swap this stanza for an HTTP MCP
    // transport pointing at a hosted BDK URL.
    'attest-conductor',
    // The attest MCP server IS registered on the Cursor target
    // (.cursor/mcp.json) but is not yet present in the OpenCode example
    // config in-tree — kept here until the OpenCode-side registration
    // lands, at which point it moves to requiredBoth above.
    'attest',
    // Phase-1 attest-ceo MCP server (PR #16) — exposes the CEO chief's
    // dispatch + record-finding + status-digest tools to the editor-side
    // CEO persona. Cursor-only; the CEO's authoritative behavior runs as
    // a BDK agent (`packages/attest-ceo`) on the deployed side.
    'attest-ceo',
    // Shape-C policy-dev MCP server — editor-only developer surface for
    // iterating on the attest-mcp policy engine (list_fences,
    // request_approval, pre_dispatch_check). Not shipped in the OpenCode
    // target because policy iteration is a hosted-platform concern.
    'attest-policy-dev',
  ]),

  // MCP servers that are intentionally only on the OpenCode side. Cursor
  // users wire these at the user scope (~/.cursor/mcp.json), not at the
  // project scope — so the committed .cursor/mcp.json deliberately omits
  // them to stay small and reviewable.
  opencodeOnly: new Set([
    'context7',
    'mempalace',
    'playwright-search',
    'code-search',
  ]),

  // Servers whose registration is in flight across the two targets. The
  // parity gate reports (but does not fail on) differences in this set.
  pending: new Map([
    // attest-mcp will move from cursorOnly to requiredBoth once the
    // OpenCode examples config gains an `attest` entry. Until then the
    // in-flight asymmetry is tolerated.
    [
      'attest',
      "Pending OpenCode-side registration (feat/attest-mcp). Once the " +
        "OpenCode examples/opencode.json adds an `attest` mcp entry, " +
        "move this key from mcp.cursorOnly to mcp.requiredBoth.",
    ],
  ]),
};

// A monotonic version so a reviewer sees "config touched" in the diff
// view even if sets look superficially similar. Bump when editing.
export const CONFIG_VERSION = 1;
