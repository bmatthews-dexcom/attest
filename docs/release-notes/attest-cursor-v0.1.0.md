# attest-for-Cursor v0.1.0 — release notes

**Status:** draft, pending the five integration PRs merging and the first
successful live eval against a Cursor model.

**Audience:** anyone cloning this repo onto their own machine. The code
is distributed **as source only** from `bmatthews-dexcom/attest` on
GitHub. There is **no npm package**, **no public registry**, and **no
shared pool** of attest-cursor packages. Everyone who wants to use it
clones the repo and runs `./scripts/local-install.sh`.

## What shipped

attest-for-Cursor is a complete port of the attest expert-agent system
from OpenCode (where it originated) to Cursor's native extension surface
(skills, custom subagents, rules, hooks, MCP, BDK). It is a build target
alongside the existing `attest-claude` target — the single source of
truth stays in this repo's canonical `agents/`, `skills/`, `rules/`,
`scripts/validators/` trees, and the Cursor-shaped output is generated
by `scripts/build-target-cursor.mjs`.

Five pull requests make up the release, each independently reviewable:

| # | Title | What it does |
|---|---|---|
| [#1](https://github.com/bmatthews-dexcom/attest/pull/1) | feat: Cursor build target | `scripts/build-target-cursor.mjs` and the generated `.cursor/` tree (skills + subagents + rules + hooks + `mcp.json`). Mirror of `build-target-claude.mjs` with `--check` CI parity gate. |
| [#2](https://github.com/bmatthews-dexcom/attest/pull/2) | feat: attest-mcp package | `attest-mcp` — stdio MCP server exposing 77 validator tools, `phase_gate_check`, `route_goal`, `list_experts`, 74 resources, 37 prompts. Pure ESM, Node ≥ 20, bundled source trees for offline runs. Private workspace sibling under `packages/attest-mcp/`. |
| [#3](https://github.com/bmatthews-dexcom/attest/pull/3) | feat: attest-conductor BDK agent | `attest-conductor` — BDK agent that reimplements `/autopilot` as a Ralph loop against attest-mcp, with idempotent state in `ctx.host.kv` and `dispatch_expert` routing to peer BDK experts. Private workspace sibling under `packages/attest-conductor/`. |
| [#4](https://github.com/bmatthews-dexcom/attest/pull/4) | feat: attest-experts BDK pack | `attest-experts` — multi-agent BDK layout; three Phase-1 concrete experts (security-auditor, code-reviewer, landscape-mapper) and 81 Phase-2 stubs that refuse with a structured not-ported response. Private workspace sibling under `packages/attest-experts/`. |
| [#5](https://github.com/bmatthews-dexcom/attest/pull/5) | feat: cross-package integration + e2e eval | Integration branch that threads the four PRs together, resolves contract mismatches (snake_case tool names, `plannedValidators` naming, per-validator tool dispatch, MCP-owned experts catalog), and adds `scripts/integration-smoke.mjs` + `integration/attest-e2e` eval. |

### Phase-2 ports in flight

Phase 2 of the roadmap turns the 81 stubs under
`packages/attest-experts/agents/` into real experts, one cluster at a
time. The scaffolding is in place — each stub is a working BDK agent
with a `refuse-not-ported` tool, a shared schema, and a slot in the
conductor's dispatch table. Promoting a stub to concrete is a
self-contained PR: rewrite the agent's `bot/` tools, add it to
`CONCRETE_EXPERTS` in `lib/expert-registry.ts`, regenerate
`experts.generated.json`, and `./scripts/deploy.sh` picks it up
automatically without edits.

The first Phase-2 wave on this branch stack is PR
[#6](https://github.com/bmatthews-dexcom/attest/pull/6) — adding a
`ported: boolean` field to `list_experts` so the conductor stops
hard-coding `CONCRETE_EXPERT_IDS` and asks the MCP catalog instead.

## Distribution model (Option B)

Two paths, both detailed in [`docs/deploy.md`](../deploy.md):

1. **Local run.** Everything runs on the user's machine. The conductor
   boots via `npm --prefix packages/attest-conductor run dev`, the
   experts via `npm --prefix packages/attest-experts run serve`, the
   attest-mcp stdio server via the committed `.cursor/mcp.json` that
   points at `node packages/attest-mcp/dist/cli.js`. **Zero credentials
   needed.** `./scripts/local-install.sh` is the one-shot bootstrap.

2. **Cursor-hosted deploy.** `./scripts/deploy.sh --publish` uploads the
   conductor + the three concrete experts to Cursor-managed hosting via
   `npx @cursor/bdk deploy`. **Needs `CURSOR_API_KEY` only** — created
   at Cursor Dashboard → Settings → API Keys. Nothing hits the npm
   registry, no npm-registry token exists, source stays on
   `bmatthews-dexcom/attest`.

## What's new vs. attest-for-OpenCode

| Area | OpenCode | Cursor |
|---|---|---|
| Build + install | `install.sh` writes to `~/.config/opencode/`, 1500 lines of per-OS detection, MCP registration via `opencode.json` merge | `.cursor/` committed to the repo via `npm run build:cursor`; MCP registration via committed `.cursor/mcp.json`; environment setup for cloud agents via `.cursor/environment.json` |
| Expert personas | `agents/<name>.md` with `mode: "primary"` / `mode: "subagent"` | Dual-shaped: a `.cursor/skills/<name>/SKILL.md` for `/<name>` slash-command invocation and a `.cursor/agents/<name>.md` for Task-tool dispatch, generated from the same canonical source |
| Delegation | `EXECUTOR_SELECTION.md` 4-way matrix (Task / subprocess / write-handoff / inline) | Collapses to 2 (Task tool + inline). `/in-cloud` escalation for isolated-worktree work. The HANDOFF document shape survives as the Task-tool prompt body |
| Validator wiring | Prose instructions in orchestrator agents to run `scripts/validators/run-coverage-loop.sh phase-N` | Three complementary wires: `attest-mcp` publishes each validator as a native tool; `.cursor/hooks.json` fires fast per-file validators on `afterFileEdit` and the phase gate on `stop`; the agent can also call `attest.phase_gate_check` directly to probe |
| Phase-gate state machine | `scripts/validators/validate-phase-gate.sh` shell `case` block | TypeScript mirror in `packages/attest-mcp/src/phase-gate/state-machine.ts`, with a smoke test (`test/phase-gate.test.mjs`) that diffs against the shell authority so drift goes red in CI |
| Unattended Phase 4 (/autopilot, conductor) | `scripts/conductor/conductor.mjs` spawning `opencode run --agent` subprocesses per ticket, worktree per ticket, `.git/conductor.lock` | `attest-conductor` BDK agent: TypeScript Ralph loop with `ctx.host.kv` state, idempotent mutating tools, GitHub channel + HTTP channel + chat tool entry points, peer MCP dispatch to concrete expert BDK agents |
| Resume anchor + session-model receipt plugins | `@opencode-ai/plugin` default exports, experimental `chat.system.transform` and `session.compacting` hooks | Dropped (resume anchor patches a 32k-local-model failure mode Cursor doesn't exhibit). `sessionStart` hook injects `docs/work/STATE.md` on local-only sessions; `beforeShellExecution` + `preToolUse` port the dangerous-bash / blocked-credentials guards verbatim |
| Model-tier detection | `scripts/detect-model-context.sh` + `docs/work/.model-context` + `--compact` agent overlay | Dropped. All Cursor-selectable models are frontier (200 k–1 M context). The compact-agent overlay and chunked-synthesis discipline are patches for a problem Cursor users don't have. Role-based model pinning (`model:` frontmatter on subagents) survives |
| Distribution | `install.sh` writes into `~/.config/opencode/` | **Source-only from `bmatthews-dexcom/attest`.** Users clone the repo, run `./scripts/local-install.sh`, and optionally `./scripts/deploy.sh` to Cursor hosting. No npm, no public registry |

See [`docs/attest-cursor-integration.md`](../attest-cursor-integration.md)
in this repo for the full design rationale, mapping table, and
why-not-just-copy failure modes.

## Install path

Everyone who wants to use attest-for-Cursor on their own machine:

```bash
git clone https://github.com/bmatthews-dexcom/attest.git
cd attest
./scripts/local-install.sh
```

That's the whole local path. See [`docs/deploy.md`](../deploy.md) for
the `./scripts/deploy.sh` hosted path.

## Known limitations

1. **Live eval requires a Cursor credential.** `scripts/live-eval.mjs`
   is wired up and the integration eval
   (`integration/attest-e2e`) is defined, but the first full green pass
   needs `CURSOR_API_KEY` plus a deployed (or locally served)
   `attest-conductor` + at least the `attest-expert-security-auditor`
   peer. Everything up to that point (parse, validate, dry-run) is
   green in CI.
2. **Only three concrete experts in Phase 1.** `security-auditor`,
   `code-reviewer`, `landscape-mapper`. The remaining 81 refuse with a
   structured `refuse-not-ported` response; the conductor's
   `dispatch_expert` short-circuits unported experts locally instead of
   round-tripping to a peer that would just refuse.
3. **Conductor is the orchestration brain only.** The OpenCode-era
   `scripts/conductor/conductor.mjs` also claimed git worktrees, ran
   validators from outside, and merged on green. The BDK conductor
   covers claim / dispatch / verify / gate / done — the git worktree
   surface in Cursor is handled by hooks + `/in-cloud` subagents.
4. **GitHub channel for `/autopilot` is chat-shaped, not task-shaped.**
   Follow-up tracked in the conductor README.
5. **`list_experts` doesn't yet advertise `ported: boolean`.** PR
   [#6](https://github.com/bmatthews-dexcom/attest/pull/6) adds the
   field.
6. **Design report naming is stale.**
   `docs/attest-cursor-integration.md` uses dotted MCP tool names
   (`attest.route`, `attest.gate.run`); the implementation chose
   snake_case (`route_goal`, `phase_gate_check`). Doc-only sweep
   follow-up.
7. **No one-click install from a Cursor Marketplace.** The install is
   the two-step `git clone` + `./scripts/local-install.sh` recipe.
   Deliberate — Bradford wants local-only distribution.
8. **Cursor cloud-agent hooks lose a few of the plugin surfaces.**
   `sessionStart` and `beforeMCPExecution` do not run in cloud agents
   (only local). Everything the plugins did that matters at tool-use
   time (`beforeShellExecution`, `preToolUse`, `afterFileEdit`,
   `postToolUse`, `stop`) does run in cloud agents.

## Credits

attest-for-Cursor was built as a four-worker fan-out driven by a
coordinator agent, each worker owning one PR:

- **cursor build target** — [#1](https://github.com/bmatthews-dexcom/attest/pull/1).
- **attest-mcp** — [#2](https://github.com/bmatthews-dexcom/attest/pull/2).
- **attest-conductor** — [#3](https://github.com/bmatthews-dexcom/attest/pull/3).
- **attest-experts** — [#4](https://github.com/bmatthews-dexcom/attest/pull/4).
- **integration pass** — [#5](https://github.com/bmatthews-dexcom/attest/pull/5).

Design report that framed the whole port:
[`docs/attest-cursor-integration.md`](../attest-cursor-integration.md).

Thanks to the Cursor BDK team for `@cursor/bdk`, and to Anthropic for
the MCP spec that made the shared surface portable across Cursor,
OpenCode, Claude Code, and Claude Desktop in one package.
