# attest — Cursor target

This directory is **generated** by `scripts/build-target-cursor.mjs`.
Do not edit any file under `.cursor/` by hand — CI runs
`npm run build:cursor:check` and fails on drift. Edit the canonical
sources in `agents/`, `skills/`, `rules/`, and `plugins/`, then
run `npm run build:cursor`.

## Architecture (orchestrator-first)

attest's expert personas (`security-auditor`, `code-reviewer`,
`sdlc-lead`, `ux-engineer`, …) do **not** ship here as Cursor
custom-mode / subagent files. They live as BDK agents in a sibling
package, orchestrated by a conductor:

- [`@bpmforge/attest-experts`](https://github.com/bpmforge/attest-experts) — each primary attest expert
  packaged as a `defineAgent({ … })` BDK agent.
- [`@bpmforge/attest-conductor`](https://github.com/bpmforge/attest-conductor) — the outer loop that
  claims tickets, dispatches expert agents, scores HANDOFF returns,
  and merges completed work (the `v3.9.0` autopilot shape).

The local Cursor Agent is a **thin editor-time veneer**: it talks to
those packages through MCP (`.cursor/mcp.json`) and the
`/invoke-attest-conductor` skill, and relies on the local hook layer
for safety + editor-time quality guidance.

## What ships here

| Surface | Source | Purpose |
|---|---|---|
| `rules/*.mdc` | `rules/*.md` + `agents/shared/*.md` | Editor-time quality protocols (CHALLENGER, FIX_VERIFY, GATE_SCORING, PERSISTENCE, …) as on-demand rules with `@file` pointers to the committed sources. |
| `skills/*/SKILL.md` | `skills/*/SKILL.md` + hand-authored | Only **technique / procedure** skills. See the keep set below. |
| `hooks.json` + `hooks/*.sh` | `plugins/expert-hooks.ts` | 1:1 port of the attest plugin: dangerous-bash blocker, credential-write blocker, afterFileEdit lint/typecheck/secret-scan, postToolUse telemetry, sessionStart STATE.md injection (**local-only**: Cursor cloud agents do not fire `sessionStart`), stop phase-gate. |
| `mcp.json` | generated | Points at three MCP servers: `attest` (`@bpmforge/attest-mcp`), `attest-conductor` (BDK agent), and `attest-ceo` (local workspace Phase-1 CEO MCP). |
| `agents/attest-ceo.md` | `agents/shared/chiefs/ceo.md` | Editor-side **CEO** chief as a Cursor custom-mode / subagent; tool allowlist excludes raw bash — mutations go through `attest-ceo-mcp` + dispatch via `attest-conductor`. |
| `skills/attest-ceo/SKILL.md` | `agents/shared/chiefs/ceo.md` | Same shared source, framed as a skill the current Cursor Agent loads when the user types a `/ceo` command. |

### CEO MCP surface (`attest-ceo` server, Phase 1)

Local workspace package `@bpmforge/attest-ceo-mcp` (`"private": true`,
not published to npm). Build with
`npm run build --workspace @bpmforge/attest-ceo-mcp` once; the
`mcp.json` entry spawns `node packages/attest-ceo-mcp/dist/cli.js`.
Tools exposed (names tracked by `CEO_MCP_TOOL_NAMES` in the generator):

  - `ingest_discussion` (ingest)
  - `extract_intent` (extract)
  - `draft_plan` (draft)
  - `approve_plan` (approve)
  - `deny_plan` (deny)
  - `refine_plan` (refine)
  - `dispatch_plan` (dispatch)
  - `director_create_expert` (director)
  - `roadmap_sync` (roadmapSync)
  - `autonomy_set` (autonomySet)

Plus four resources: `attest://ceo/roadmap/current`,
`attest://ceo/commitments/open`, `attest://ceo/plans/awaiting`,
`attest://ceo/decisions/recent`.

### Kept skills (techniques, 13 total — includes `invoke-attest-conductor` + `attest-ceo`)

api-ground, design-options, explore, game-asset-pipeline, gate, goal, pre-code, reflow, simplify, vault, wave, invoke-attest-conductor, attest-ceo

### Dropped skills (personas — live in @bpmforge/attest-experts, 37 total)

a11y, analytics, api-design, architect, autopilot, challenge, code, containers, cost, data-governance, dba, design-iterate, devops, documentation-gap-finder, end-user-simulator, frontend, gauntlet, git, guide, llm-integration, migration-planner, onboard-gap-fill, onboard-inventory, onboard-verify, perf, release, reliability, research, review, review-code, sdlc, security, steward, test-expert, ui-verify, user-guide, ux

See `scripts/build-target-cursor.mjs` → `PERSONA_SKILL_DROPS` /
`TECHNIQUE_SKILL_KEEPS` / `SKILL_AMBIGUITY_NOTES` for the per-skill
rationale, and the design report at
`docs/attest-cursor-integration.md` for the architecture reasoning.

## Regenerate

```sh
npm run build:cursor         # write mode: regenerate the full tree
npm run build:cursor:check   # CI drift gate: exits 1 on any difference
```
