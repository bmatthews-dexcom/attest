# attest

Expert agent system for [OpenCode](https://opencode.ai) — 39 primary expert agents + 32 cluster specialists (security, code-review, performance, onboarding, game dev), 48 skills, a 4-mode SDLC workflow, full git lifecycle management, and 71 automated validators that enforce quality gates at every phase. Works with cloud frontier models and small local models (32k LM Studio/Ollama) via tier detection, compact agent variants, and capability-probed delegation.

**Not sure which command to run? Just describe your goal:** `/guide` is the front door — it routes any plain-English goal ("securely check all my source and help fix the issues", "this codebase is unfamiliar", "harden before launch") to the right expert and drives the workflow, always offering the next step.

Sibling project: [`attest-claude`](https://github.com/bpmforge/attest-claude) — same experts for Claude Code, generated from this repo.

## Install

**Starting from a fresh machine?** You need `git` to clone this, so that one step
is on you — everything after it the installer offers to install for you (Node,
`jq`, compilers, MCP servers).

```bash
# fresh WSL / Ubuntu / Debian
sudo apt-get update && sudo apt-get install -y git curl ca-certificates

# Fedora / RHEL:  sudo dnf install -y git curl ca-certificates
# Arch:           sudo pacman -S --noconfirm git curl ca-certificates
# Alpine:         sudo apk add git curl ca-certificates
# macOS:          git ships with the Xcode command line tools (xcode-select --install)
```

Then:

```bash
git clone https://github.com/bpmforge/attest.git
cd attest
./install.sh
```

That gives you **`main`** — the newest state, which can contain work landed since the last release.

**To install a specific release instead** (pick the version from [Releases](https://github.com/bpmforge/attest/releases)):

```bash
git clone --branch v3.1.25 --depth 1 https://github.com/bpmforge/attest.git
cd attest
./install.sh
```

Or, in a clone you already have:

```bash
git fetch --tags
git checkout v3.1.25   # prints a "detached HEAD" notice — that is expected
./install.sh
```

**`main` vs a tag:** `main` moves with every push; a tag (`v3.1.25`) always points at the same commit. Use a tag when you want a fixed, CI-verified state; use `main` for the newest work. The "detached HEAD" notice on checkout is normal and installing works fine — you only need a branch if you intend to edit: `git checkout -b my-fix v3.1.25`. Go back to the latest with `git checkout main && git pull`.

`install.sh` records what it installed to `experts-version` in the install directory, so you can always tell which one is active.

Common flags: `--project` (install into `.opencode/` instead of global), `--compact` (overlay compact agent variants for 32k local models), `--tools` (install the optional code-analysis tools — semgrep, knip, vulture, mmdc, …), `--link` (symlink for dev), `--semgrep`, `--pullmd`, `--no-playwright-search`, `--uninstall`. Requires macOS, Linux, or WSL2. **Use opencode ≥ v1.2.11** — older builds stop after every tool call on OpenAI-compatible/local endpoints (the `finish_reason:"stop"` bug, fixed in PR #14973); `doctor.sh` warns on older versions.

**Verify the install:**

```bash
~/.config/opencode/scripts/doctor.sh        # structure, deps, config, model backend, agent discovery
~/.config/opencode/scripts/check-tools.sh   # which optional analysis tools are present (add: --install)
```

`Status: HEALTHY` means everything works. Re-run any time something feels broken.

## Update

One command, from your existing checkout:

```bash
./install.sh --update
```

It fetches releases, moves this checkout to the newest one, reinstalls, and tells you what it moved from and to. Works whether you're on `main` or pinned to an older tag, and it's safe to run when you're already current. Follow with `doctor.sh`.

It stops without changing anything if you have uncommitted edits to tracked files, and shows you which — so it can't quietly discard your work. (Untracked files are left alone.)

Prefer to track `main` by hand? `git pull && ./install.sh` still works — but note `git pull` is a silent no-op if you're on a tag, which is exactly the trap `--update` avoids.

## First command

Two ways to start:

```
/guide                                       # describe any goal in plain English
/sdlc init my-project "short description"     # or go straight to a workflow
```

Plain English routes automatically — `/guide` (or the SDLC lead) detects intent:

| You say | Runs |
|---------|------|
| "I don't know where to start / what can this do?" | `/guide` |
| "build a new app" | `/sdlc init` |
| "build a game" | `/sdlc init --game` |
| "understand this codebase" | `/sdlc onboard` |
| "add X feature" | `/sdlc feature` |
| "review / audit / find gaps / make it better" | `/sdlc improve` |
| "securely check my source and help fix it" | `/security --fix` |
| "is there code nothing uses?" | `/review-code` (dead-code dimension) |
| "make the UI actually match the design / show me it's right visually" | `/design-iterate` |
| "make this as good as <real product X> — keep going until it beats it" | `/gauntlet` |
| "a wave of tickets just landed — review what they add up to" | `/wave` |
| "keep going until metric X passes / budget Y runs out" | `/goal` |
| "look at what's left, pick the path, and auto-run the product to completion" | `/autopilot` **Field-proven 2026-09-01**: a two-ticket product driven end-to-end (OpenAI terra codes, luna reviews, runtime verified, merged, board drained) — the PRIMARY agent kicks off, tracks, and reconciles it per the skill's OPERATE section; handoffs only where the ladder names one. |

## Highlights

- **`/guide` concierge** — front door that routes any goal to the right expert.
- **Security find-and-fix** — `/security` audits all source; `/security --fix` drives a verified remediation loop (fix → re-scan to confirm closed, never the model's say-so).
- **9-dimension code health** including a dead-code/stub/unused-export detector.
- **Deterministic scaffolding** — `run-plan.mjs` (DAG runner for decomposed tasks), `fix-verify.mjs` (re-verify gate), `mermaid-fix.mjs` + render-validated diagrams. Scripts own control flow and verification; models do the judgment work — which keeps heavy jobs reliable on small local models.
- **Unattended Phase 4** — the conductor (`scripts/conductor/`) works a `plan.json` board on its own: claim → code in an isolated worktree → review on a *different model* → runtime verification → merge → next. Reviewers are triggered by what the diff touches (auth pulls in security, queries pull in perf), every landed ticket carries its own review documents, a failed one goes back to `ready` with its evidence preserved, and five startup gates refuse a bad board before a single model call. See [docs/UNATTENDED_EXECUTION.md](docs/UNATTENDED_EXECUTION.md). Planning stays interactive — the Discovery Interview is NEVER-AUTO.
- **Any LLM** — tier detection, compact agent variants (`dist/compact-agents/`, install with `--compact`), capability-probed delegation (`agents/shared/EXECUTOR_SELECTION.md` — HANDOFF, never a naive spawn), a **plan-strong/execute-cheap tier split** (`MODEL_ADAPTER.md` Rule 5), checkpoint/revert recovery (`CHECKPOINT_REVERT.md`), and a local-model picks + runtime-gotchas playbook (`references/local-agentic-models.md`).
- **Eval suite** — `npm run evals` runs the pipeline against fixture repos with planted defects (`evals/`). `EVAL_MODEL=<provider/model>` pins a model per run and `npm run evals:compare` produces a **tiered frontier-vs-local lift / gap / cost** report (outcome-based scoring, sandboxed agent runs); `npm run evals:status` shows live sub-agent fan-out. Protocol changes and model choices are measured, not vibed.
- **Telemetry** — every completed assistant message logs real token/cost actuals to `docs/work/telemetry.jsonl` (plugin hook; counts only, never content; `EXPERTS_TELEMETRY=0` to disable). `npm run telemetry:report` turns the data into tuned tier budgets, timeouts, and escalation thresholds.

## Cursor target architecture

attest also ships as a Cursor-native target, built from the same canonical
sources. The design report (`docs/attest-cursor-integration.md`) picks an
**orchestrator-first** shape: the Cursor-local tree is a thin editor-time
veneer (rules, hooks, mcp.json, 12 technique skills); the expert personas
live in `@bpmforge/attest-experts` as deployable BDK agents; a central
`@bpmforge/attest-conductor` BDK agent runs the Ralph loop that routes
goals, dispatches experts, runs validators, and advances phase gates.

Four PRs land the architecture plus one that proves it end-to-end:

| PR | Package / tree | What it ships |
| --- | --- | --- |
| [#1 — feat: Cursor build target](https://github.com/bmatthews-dexcom/attest/pull/1) | `.cursor/` + `scripts/build-target-cursor.mjs` | Thin editor-time veneer. 35 rules (shared protocols with `@file` pointers), 12 skills (techniques + `invoke-attest-conductor`), 6 hooks (dangerous-bash blocker, credential-write blocker, afterFileEdit lint/typecheck/secret-scan, telemetry, sessionStart STATE.md inject, stop phase-gate), 2 MCP servers (`attest` + `attest-conductor`). |
| [#2 — feat: attest-mcp package](https://github.com/bmatthews-dexcom/attest/pull/2) | `packages/attest-mcp/` (`@bpmforge/attest-mcp`) | Stdio MCP server exposing attest's 77 validators as per-tool `validate_<id>`, plus `phase_gate_check`, `route_goal`, `list_experts`, 74 resources, 37 prompts. The one place validator / phase-gate / routing logic lives. |
| [#3 — feat: attest-conductor BDK agent](https://github.com/bmatthews-dexcom/attest/pull/3) | `packages/attest-conductor/` | BDK agent implementing the Ralph Wiggum loop. TypeScript owns a bounded `while(!stop)` loop + idempotent state in `ctx.host.kv`; the LLM picks one tool mutation per iteration from `dispatch_expert`, `phase_gate_check`, `validate_<name>`, `advance_phase`, `conductor_record_finding`, `update_scratchpad`, `compact_state`, `mark_done`, `escalate`. |
| [#4 — feat: attest-experts BDK pack](https://github.com/bmatthews-dexcom/attest/pull/4) | `packages/attest-experts/` (`@bpmforge/attest-experts`) | 3 concrete + 81 Phase-2 stub BDK agents, one per attest primary expert. Each concrete expert exposes `submit-report`; each stub exposes `refuse-not-ported`. Deployable one-per-slug via `bdk deploy --dir agents --all`. |
| [#5 — feat: cross-package integration + e2e eval](https://github.com/bmatthews-dexcom/attest/pull/5) | `evals/integration/`, `scripts/integration-smoke.mjs`, `evals/fixtures/trivial-repo/` | One BDK eval + one Node smoke script that drive the real stack end-to-end against a trivial fixture repo. See "Integration smoke" below. |

### Dispatch flow

```
   user → Cursor Agent (local, thin veneer)
          │
          │  /invoke-attest-conductor skill
          │  dials `attest-conductor` MCP server
          ▼
   @bpmforge/attest-conductor  (BDK agent, Ralph loop)
          │
          ├── attest-mcp (`@bpmforge/attest-mcp`)
          │     ├── route_goal(goal)         → expert id + plannedValidators[]
          │     ├── phase_gate_check(phase)  → plannedValidators[]
          │     ├── validate_<id>(scope)     → gap-list envelope
          │     └── list_experts()           → catalog with invocationHint
          │
          └── peer BDK agents (`@bpmforge/attest-experts`)
                ├── attest-expert-security-auditor  (concrete)
                ├── attest-expert-code-reviewer     (concrete)
                ├── attest-expert-landscape-mapper  (concrete)
                └── attest-expert-<rest>             (81 Phase-2 stubs → refuse-not-ported)
```

### Integration smoke

`scripts/integration-smoke.mjs` has two modes:

- `--stub` (default) — in-process checks of the conductor's prompt
  shape, the stub attest-mcp catalog, and the dispatch-expert stub
  pathway. No external processes, no credentials. Runs on every
  checkout.
- `--real` — boots the real `attest-mcp` child process, probes its
  inventory, and discovers the three attest-experts peer slugs via
  `bdk info`. Requires `CURSOR_API_KEY` (or `CURSOR_API_KEY_FILE`
  / `CURSOR_SERVICE_ACCOUNT_KEY` / a `bdk login` session) to drive
  agent turns; without one, exits cleanly with code 2 and a "need
  CURSOR_API_KEY" message, never a crash.

The companion BDK eval is `packages/attest-conductor/evals/integration/attest-e2e.eval.ts`
(`npx @cursor/bdk eval --dir packages/attest-conductor integration/attest-e2e`).
It asserts the full dispatch loop (`run_autopilot_task` → `route_goal`
→ `dispatch_expert` → `phase_gate_check` → `validate_<name>` →
`mark_done`) with the real experts mounted as peers.

## Migrate an OpenCode install to Cursor

Already have attest-for-OpenCode installed and want the Cursor-flavored sibling alongside it? There is one command:

```bash
npm run migrate:to-cursor              # live write to <cwd>/.cursor/
npm run migrate:to-cursor -- --dry-run # show the plan, write nothing
```

What it does, briefly:

1. Detects your existing attest-for-OpenCode install (checks the markers `install.sh` places at `~/.config/opencode/` and / or `.opencode/`), reports what it found.
2. Runs `scripts/build-target-cursor.mjs --write` to generate a complete `.cursor/` tree (rules, technique skills, hooks, `mcp.json`) in your current working directory.
3. Writes `.cursor/MIGRATION_NOTES.md` with a per-surface summary of what was ported, what was intentionally dropped, and what to configure next (CURSOR_API_KEY, which MCP servers to enable at user vs. project scope).

**Coexistence guarantee:** the migration script does **not** modify or uninstall the OpenCode install. The two live in different directories (`~/.config/opencode/` / `.opencode/` for OpenCode, `.cursor/` for Cursor) and can be used side by side; uninstalling either does not touch the other.

The Cursor target is a thin editor-time veneer — the expert personas run as deployable BDK agents in `@bpmforge/attest-experts`, orchestrated by `@bpmforge/attest-conductor` and invoked from the local Cursor Agent via the generated `/invoke-attest-conductor` skill. See the "Cursor target architecture" section above and `docs/attest-cursor-integration.md` for the full design.

## Docs

- [docs/SETUP.md](docs/SETUP.md) — **start here**: prerequisites, embedding models, env vars, troubleshooting
- [docs/USERGUIDE.md](docs/USERGUIDE.md) — how to invoke each expert
- [docs/FEATURES.md](docs/FEATURES.md) — full agent, skill, validator, and protocol catalog
- [docs/SDLC_GUIDE.md](docs/SDLC_GUIDE.md) — SDLC workflow, phases, git model, and traceability chain
- [docs/UNATTENDED_EXECUTION.md](docs/UNATTENDED_EXECUTION.md) — running Phase 4 coding tickets unattended: the conductor, its startup gates, diff-triggered reviewers, Jira mirroring, and what to check before pointing it at a large board
- [docs/LOCAL_LLM_GUIDE.md](docs/LOCAL_LLM_GUIDE.md) — running on local models (tiers, compact variants)
- [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) — adding agents or skills (and the single-source build for attest-claude)
- [Releases](https://github.com/bpmforge/attest/releases) — release notes for each version (the per-release detail lives in the annotated tag; `CHANGELOG.md` covers 1.x–2.12 only)

## License

[Apache License 2.0](LICENSE) — Copyright 2026 Bradford Matthews.
