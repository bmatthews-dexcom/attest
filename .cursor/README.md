# attest — Cursor target (Shape C — hybrid chief)

This directory is **generated** by `scripts/build-target-cursor.mjs`.
Do not edit any file under `.cursor/` by hand — CI runs
`npm run build:cursor:check` and fails on drift. Edit the canonical
sources in `agents/`, `agents/shared/chiefs/`, `skills/`,
`rules/`, and `plugins/`, then run `npm run build:cursor`.

## Architecture — two chiefs, one policy engine (LOCAL-ONLY)

attest's expert personas do **not** ship here as Cursor custom-mode /
subagent files. They live either as in-process handlers inside the
workspace sibling `attest-mcp` (readers / analyzers /
validators) or as sandbox-isolated BDK agents in the workspace sibling
`attest-experts` (writers / publishers / pushers). The chief
is split in two:

| Chief | Lives in | Starts a turn when | Owns |
|---|---|---|---|
| **Hosted conductor** (workspace sibling `attest-conductor`) | BDK pod (local or Cursor-hosted) | GitHub webhook (`/autopilot <goal>`) or scheduled run | Long-running, unattended autopilot |
| **sdlc-lead** (`.cursor/skills/sdlc-lead/SKILL.md` + `.cursor/agents/sdlc-lead.md`) | Cursor Agent in the user's editor | User keystroke in Cursor chat (`/sdlc …`, phase question, routing ask) | Interactive /sdlc work |

> **Local-only — hard constraint.** `attest-mcp`,
> `attest-experts`, and `attest-conductor` are
> workspace siblings in `packages/`. They are **never** fetched from
> the npm registry — not via `npx`'s auto-install flag, not under any
> flag. The generated `.cursor/` tree invokes them through local
> workspace paths; a missing local build is a loud error, not a silent
> download. The Cursor-hosted deploy path for the conductor is
> `npx @cursor/bdk deploy` from `packages/attest-conductor`;
> `@cursor/bdk` is Cursor's own tool and the only outside dependency.

Both share one `attest-mcp` policy engine, one `attest-experts`
fleet, and one phase-gate state machine. See
`docs/attest-chief-architecture.md` §Recommendation and
§Migration path for the full design rationale.

The local Cursor Agent is a **thin editor-time veneer** on top of those
pieces: it talks to them through MCP (`.cursor/mcp.json`),
dispatches long-running work through `/invoke-attest-conductor`,
runs interactive SDLC work as `sdlc-lead`, and relies on the local
hook layer for the editor-side "no" before destructive ops.

## What ships here

| Surface | Source | Purpose |
|---|---|---|
| `rules/*.mdc` | `rules/*.md` + `agents/shared/*.md` (top-level only) | Editor-time quality protocols (CHALLENGER, FIX_VERIFY, GATE_SCORING, PERSISTENCE, …) as on-demand rules with `@file` pointers to the committed sources. |
| `agents/sdlc-lead.md` | `agents/shared/chiefs/sdlc-lead.md` | Editor-side **SDLC** chief as a Cursor custom-mode / subagent; tool allowlist excludes raw bash for destructive ops. |
| `skills/sdlc-lead/SKILL.md` | `agents/shared/chiefs/sdlc-lead.md` | Same shared source, framed as a skill the current Cursor Agent loads when the user asks for /sdlc work. |
| `agents/attest-ceo.md` | `agents/shared/chiefs/ceo.md` | Editor-side **CEO** chief as a Cursor custom-mode / subagent; tool allowlist excludes raw bash — mutations go through `attest-ceo-mcp` + dispatch via `attest-conductor`. |
| `skills/attest-ceo/SKILL.md` | `agents/shared/chiefs/ceo.md` | Same shared source, framed as a skill the current Cursor Agent loads when the user types a `/ceo` command. |
| `skills/invoke-attest-conductor/SKILL.md` | hand-authored | Routes long-running /multi-expert work to the hosted conductor BDK agent. Prefers `sdlc-lead` for small SDLC asks. |
| `skills/<technique>/SKILL.md` (11 others) | `skills/*/SKILL.md` | Only **technique / procedure** skills. See the keep set below. |
| `hooks.json` + `hooks/block-*.sh`, `hooks/post-edit-check.sh`, `hooks/telemetry.sh`, `hooks/inject-state.sh`, `hooks/end-of-turn-gate.sh` | `plugins/expert-hooks.ts` | Baseline (pre-Shape-C) hooks: dangerous-bash blocker, credential-write blocker, afterFileEdit lint/typecheck/secret-scan, postToolUse telemetry, sessionStart STATE.md injection (**local-only**: Cursor cloud agents do not fire `sessionStart`), stop phase-gate. |
| `hooks/evaluate-shell-policy.sh`, `hooks/evaluate-write-policy.sh` | generated | Shape-C policy integration: delegates to attest-mcp's policy engine before every shell call and file mutation. See below. |
| `mcp.json` | generated | Four MCP servers: `attest`, `attest-conductor`, `attest-policy-dev`, `attest-ceo`. See below. |

### CEO MCP surface (`attest-ceo` server, Phase 1)

Local workspace package `attest-ceo-mcp` (`"private": true`,
not published to npm). Build with
`npm --workspace packages/attest-ceo-mcp run build` once; the
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

### Kept skills (techniques, 14 total — includes `invoke-attest-conductor` + `sdlc-lead` + `attest-ceo`)

api-ground, design-options, explore, game-asset-pipeline, gate, goal, pre-code, reflow, simplify, vault, wave, invoke-attest-conductor, sdlc-lead, attest-ceo

### Dropped skills (personas — live in the workspace sibling attest-experts, 37 total)

a11y, analytics, api-design, architect, autopilot, challenge, code, containers, cost, data-governance, dba, design-iterate, devops, documentation-gap-finder, end-user-simulator, frontend, gauntlet, git, guide, llm-integration, migration-planner, onboard-gap-fill, onboard-inventory, onboard-verify, perf, release, reliability, research, review, review-code, sdlc, security, steward, test-expert, ui-verify, user-guide, ux

See `scripts/build-target-cursor.mjs` → `PERSONA_SKILL_DROPS` /
`TECHNIQUE_SKILL_KEEPS` / `SKILL_AMBIGUITY_NOTES` for the per-skill
rationale, and the chief architecture doc
(`docs/attest-chief-architecture.md`) for the Shape-C reasoning.

## Shape-C policy hooks

Two hooks delegate to the attest-mcp policy engine on every call:

| Hook | Cursor surface | attest-mcp tool |
|---|---|---|
| `hooks/evaluate-shell-policy.sh` | `beforeShellExecution` | `attest.evaluate_shell_policy` |
| `hooks/evaluate-write-policy.sh` | `preToolUse` matcher `Write`/`Edit` | `attest.evaluate_write_policy` |

Each hook walks a **local-only** invocation chain, in order:

1. `attest-mcp-policy evaluate --kind=<shell|write>` — the
   dedicated bin shipped by `attest-mcp`'s `bin` field;
   resolves via `./node_modules/.bin/` after `npm install` at
   the repo root.
2. `attest-mcp policy --kind=<shell|write>` — the main
   `attest-mcp` CLI's `policy` subcommand (compat path).
3. **Hard fail.** The hook never shells out to `npx` with the
   auto-install flag, never passes `--package=…`, never fetches
   from the npm registry under any flag. If neither bin resolves, the
   hook returns a crisp error naming the install step
   (`npm install at repo root (packages/* are workspace siblings; attest-mcp is NOT published to npm)`).

The hook pipes the Cursor hook JSON into whichever bin resolves,
expects a Cursor hook decision JSON on stdout, and respects
`ATTEST_POLICY_MODE`:

- `ENFORCE` — fail-closed on engine error or `deny`.
- `LOG_ONLY` — log + allow on engine error (dev / policy authoring).
- `OFF` — skip the policy call entirely (local escape hatch).

The hooks are **additive** to the hard-coded blockers
(`block-dangerous.sh`, `block-credentials.sh`); a deny from either
stops the op. Decisions in LOG_ONLY mode are appended to
`docs/work/policy-decisions.jsonl`.

`beforeMcpInvoke` is **not** wired: Cursor's current hook surface
(https://cursor.com/docs/agent/hooks) does not expose that hook, so
the editor-side "no" before an MCP tool call cannot be enforced
client-side today. attest-mcp's server-side `tools/call` check
remains the authoritative chokepoint; the user hears the refusal via
the MCP error. Reintroduce the client-side mirror when Cursor adds the
hook.

## Shape-C MCP servers (LOCAL-ONLY)

`.cursor/mcp.json` wires three MCP servers; all three are invoked via
LOCAL workspace paths — no auto-install `npx`, no registry fetch:

- `attest` — `node ./packages/attest-mcp/dist/cli.js`. The policy host and the
  validator surface. Policy tools (new in Shape C): `evaluate_shell_policy` (shell), `evaluate_write_policy` (write), `evaluate_mcp_policy` (mcp), `list_fences` (fences), `request_approval` (approval), `invoke_expert` (invoke), `pre_dispatch_check` (preDispatch).
- `attest-conductor` — `cursor-bdk serve --dir ./packages/attest-conductor --mode single`.
  The Cursor-published `@cursor/bdk` tool must be installed as a
  workspace devDependency ahead of time; do NOT expect it to be
  fetched at hook time. For a Cursor-hosted deploy, swap this stanza
  for an HTTP MCP transport pointing at the URL that
  `npx @cursor/bdk deploy` returned.
- `attest-policy-dev` — same local build as `attest`, pinned to
  `ATTEST_POLICY_MODE=LOG_ONLY` so sdlc-lead can author / test
  policies against a live engine without blocking the user. Decisions
  go to `docs/work/policy-decisions.jsonl` via the hooks.

### Local install (one-time)

Before Cursor can launch the MCP servers or run the policy hooks:

```sh
npm install                               # links workspace siblings into
                                           # ./node_modules/.bin/
npm --workspace packages/attest-mcp run build
                                           # produces the dist/ output
                                           # that mcp.json invokes
```

Neither step touches the registry for `attest-mcp`,
`attest-experts`, or `attest-conductor` — they are
workspace packages, linked locally.

### Flipping policy mode: LOG_ONLY → ENFORCE

Shape-C ships with the policy engine in **LOG_ONLY mode** by default so
you can author policies before they start blocking you. To flip to
ENFORCE:

1. **Review the decision log.** Open `docs/work/policy-decisions.jsonl`
   and the attest-mcp policy audit stream. Confirm the policies you
   expect to apply have been exercised and the deny/allow calls match
   your intent. (A good signal: at least one week of normal SDLC work
   with no false denies on the paths you care about.)
2. **Flip the mode.** Set `ATTEST_POLICY_MODE=ENFORCE` in the user
   shell env (e.g. your `.zshrc`), or in the `attest` entry of
   `.cursor/mcp.json` under `env`. The `attest-policy-dev`
   server stays pinned to LOG_ONLY so you still have a live
   authoring sandbox.
3. **Keep an escape hatch.** `ATTEST_POLICY_MODE=OFF` disables the
   client-side policy hooks entirely (the server-side chokepoint still
   applies). Use for one-off local debugging only — the hook layer is
   the editor-experience "no" that keeps you from forming plans the
   server will reject anyway.

## Regenerate

```sh
npm run build:cursor         # write mode: regenerate the full tree
npm run build:cursor:check   # CI drift gate: exits 1 on any difference
```
