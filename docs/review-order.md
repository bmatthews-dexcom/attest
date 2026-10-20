# Review order — Cursor target integration stack

Review guide for PRs [#1](https://github.com/bmatthews-dexcom/attest/pull/1)–[#5](https://github.com/bmatthews-dexcom/attest/pull/5) on `bmatthews-dexcom/attest`. The stack ports attest to Cursor following the shape recommended in the attest → Cursor integration design report (`attest-cursor-integration.md`, project store).

## 1. What this stack lands

Shape-2 of the design report (section 6): expert personas run as deployable BDK agents in [`attest-experts`](https://github.com/bmatthews-dexcom/attest/pull/4) (3 concrete + 81 Phase‑2 stubs), orchestrated by [`attest-conductor`](https://github.com/bmatthews-dexcom/attest/pull/3) (Ralph loop over `ctx.host.kv`); [`attest-mcp`](https://github.com/bmatthews-dexcom/attest/pull/2) exposes attest's 77 validators + phase‑gate state machine + `/guide` router + experts catalog over stdio MCP; [`scripts/build-target-cursor.mjs`](https://github.com/bmatthews-dexcom/attest/pull/1) generates a thin `.cursor/` veneer (rules, hooks, 12 technique skills, two‑server `mcp.json`, `invoke-attest-conductor` skill); and [the integration PR](https://github.com/bmatthews-dexcom/attest/pull/5) merges all four, adds `scripts/integration-smoke.mjs` + an `attest-e2e.eval.ts` BDK eval, and documents the three contract‑fix commits that landed on the feature branches during integration.

## 2. Recommended merge order

```
#2  attest-mcp  ──┐
                   ├──→  #1  cursor target  ──┐
#4  attest-experts─┤                           ├──→  #5  integration
                   └──→  #3  attest-conductor ─┘
```

**Wave 1 (any order): [#2](https://github.com/bmatthews-dexcom/attest/pull/2) and [#4](https://github.com/bmatthews-dexcom/attest/pull/4) — leaf packages.** Both add a new workspace package under `packages/` and the one‑line `"workspaces": ["packages/*"]` at the repo root. Neither imports from the other, from the conductor, or from the build target. Merge either first; the second converges cleanly on the `workspaces` line.

**Wave 2 (any order after Wave 1): [#1](https://github.com/bmatthews-dexcom/attest/pull/1) and [#3](https://github.com/bmatthews-dexcom/attest/pull/3) — consumers of the leaves.** [#1](https://github.com/bmatthews-dexcom/attest/pull/1)'s generated `.cursor/mcp.json` points at `npx --yes attest-mcp` ([#2](https://github.com/bmatthews-dexcom/attest/pull/2)) and its `invoke-attest-conductor` skill dials `packages/attest-conductor` ([#3](https://github.com/bmatthews-dexcom/attest/pull/3)). [#3](https://github.com/bmatthews-dexcom/attest/pull/3) dispatches to peer slugs defined in [#4](https://github.com/bmatthews-dexcom/attest/pull/4) via `host.mcp.callTool("attest-expert-*", "ask", …)`. If [#2](https://github.com/bmatthews-dexcom/attest/pull/2) or [#4](https://github.com/bmatthews-dexcom/attest/pull/4) is still open, both work with the stubs each ships, so this ordering is a soft "prefer" rather than a hard dependency.

**Wave 3: [#5](https://github.com/bmatthews-dexcom/attest/pull/5) last.** The integration PR is `main` with the four feature branches merged in (`--no-ff`) plus `scripts/integration-smoke.mjs`, `evals/fixtures/trivial-repo/`, `packages/attest-conductor/evals/integration/attest-e2e.eval.ts`, and a README section. Merging it before the four feature PRs would duplicate commits; merging it after keeps the history clean.

## 3. Per-PR review focus

### [#2 — feat: attest-mcp package](https://github.com/bmatthews-dexcom/attest/pull/2)

- **Size:** `packages/attest-mcp/` (+5,062 / −140 across 24 files). Isolated except for the workspaces line.
- **Validator surface math (`src/validators/catalog.ts`, `test/catalog.test.mjs`).** Confirm the 79→77 reduction: `validate-phase-gate.sh` reserved for the dedicated `phase_gate_check` tool, `validate-scope.match.test.sh` is a test harness, helpers (`_lib*.sh`) and orchestrators (`run-coverage-loop.sh`, `run-handoff-gates.sh`) are omitted deliberately.
- **Phase‑gate mirror (`src/phase-gate/state-machine.ts` + `test/phase-gate.test.mjs`).** The TS mirror of `validate-phase-gate.sh`'s `case` block has a drift test that diffs the mirror against the shell. If you touch either, confirm the diff still passes.
- **TS2589 escape hatches (`src/server.ts`).** Three MCP SDK schemas are declared as `any` with eslint-disable comments to work around TypeScript instantiation-depth blow-up when registering 80+ tools. Runtime schemas are intact (inspector-verified); check the review focus requests list — safe to leave as‑is until the SDK ships a non-generic registration API.
- **Routing table (`src/routing/table.ts`).** 33 entries mirroring `agents/guide.md`. Spot-check a couple of substring tokenizations and the ambiguous fall-back to `/guide`.
- **Safe to skim:** `scripts/bundle-sources.mjs` (prepack copier, 301 files, straightforward), the 33 generated `attest://experts/<id>` resources, and the 37 `attest://protocols/<slug>` loader (`src/protocols/loader.ts`) — all mechanical enrichment.

### [#4 — feat: attest-experts BDK pack](https://github.com/bmatthews-dexcom/attest/pull/4)

- **Size:** `packages/attest-experts/` (+10,636 / −452 across 284 files). Bulk is the 81 stub boilerplate — do not read it line‑by‑line.
- **Shared base (`lib/schema.ts`, `lib/expert-factory.ts`, `lib/submit-report-tool.ts`).** This is the whole conductor↔expert contract. Confirm `expertInputSchema` / `expertOutputSchema` are what you want (`task_id`, `goal`, `current_phase`, `prior_findings`, `constraints` → `findings`, `suggested_next_phase`, `blockers`, `artifacts`, `done`, `summary`). `submit-report-tool.ts` pins `expert_id` server-side — the agent cannot forge it.
- **Three concrete experts.** `agents/{security-auditor,code-reviewer,landscape-mapper}/bot/{agent.ts,instructions.md,tools/submit-report.ts}`. Each is a one‑call wrapper around the shared factory; the real review surface is the shared base + the per‑expert `instructions.md`.
- **Stub MCP server (`lib/stub-mcp-server.mjs`).** Bundled minimal MCP (`@modelcontextprotocol/sdk`) because BDK rejects inline `tools:` with `advertiseTools: true`. Serves 5 fixtures: `get_expert_manifest`, `get_persona`, `get_protocol`, `list_validators`, `run_validator`.
- **Stub generator (`scripts/sync-stubs.ts`).** Idempotent, `--check` wired into CI. If you want to confirm the 81‑stub list is correct, run `npm --prefix packages/attest-experts run sync-stubs -- --check`.
- **Deviation #1 — persona per-session, not at construction time.** `defineAgent` is sync; `instructions.md` tells the agent to call `get_persona` first. Called out in the PR body.
- **Safe to skim:** the 81 `agents/<id>/bot/{agent.ts,instructions.md,tools/refuse-not-ported.ts}` stub triples (all identical shape) and `lib/experts.generated.json` (regenerated by `sync-stubs`).

### [#1 — feat: Cursor build target](https://github.com/bmatthews-dexcom/attest/pull/1)

- **Size:** `scripts/build-target-cursor.mjs` + 57 generated files under `.cursor/` + `.github/workflows/ci.yml` step (+3,367 / −0 across 60 files).
- **Classification tables at the top of `scripts/build-target-cursor.mjs`.** `SHARED_RULE_SKIPS` (4 OpenCode‑tier docs dropped), `PERSONA_SKILL_DROPS` (29 pattern‑matched + 8 ambiguous judgment calls), `TECHNIQUE_SKILL_KEEPS` (11), and `SKILL_AMBIGUITY_NOTES` (per‑skill reasoning for `gauntlet`, `design-iterate`, `reflow`, `wave`, `autopilot`, `vault`, `guide`). The parity check forces every source skill into exactly one of DROP/KEEP so a newly added source skill cannot be silently missed.
- **Hooks (`.cursor/hooks.json` + `.cursor/hooks/*.sh`).** 1:1 port of `plugins/expert-hooks.ts`: `block-dangerous.sh`, `block-credentials.sh`, `post-edit-check.sh`, `telemetry.sh`, `inject-state.sh` (sessionStart — flagged local‑only in `hooks.json` `_note`), `end-of-turn-gate.sh`. Each was smoke‑tested with the exact JSON Cursor would emit — spot-check one if you want.
- **`.cursor/mcp.json` conductor entry.** Two servers: `attest` → `npx --yes attest-mcp`; `attest-conductor` → `npx --yes @cursor/bdk serve --dir ./packages/attest-conductor --mode single` (private package, no `bin` — this is the local‑dev shape; the `$comment` field documents the deployed swap).
- **`invoke-attest-conductor` skill.** The only hand‑authored skill in the output. Three invocation paths: MCP tool (`attest-conductor.run_autopilot_task`), HTTPS POST, GitHub comment.
- **CI gate (`.github/workflows/ci.yml`).** `npm run build:cursor:check` runs on every PR and push; unlike the Claude target's push‑only gate, this is PR‑safe from day one because the output is in‑tree.
- **Safe to skim:** the 35 generated `.cursor/rules/*.mdc` (all `@file` pointers), the PROSE+PATHS transforms table (mechanical renames of OpenCode→Cursor paths), and `.cursor/README.md` (regenerable).

### [#3 — feat: attest-conductor BDK agent](https://github.com/bmatthews-dexcom/attest/pull/3)

- **Size:** `packages/attest-conductor/` (+13,855 / −452 across 47 files). Includes two post‑scaffold fix commits noted in the body.
- **Ralph loop decomposition (`bot/lib/ralph-loop.ts`).** TS owns the loop driver, `kv` load/save, prompt rendering, escalation thresholds (iteration cap 6, wall‑time 15 min, no‑progress 3), compaction trigger (4 KB), idempotency guard (`alreadyApplied` / `recordAction` keyed on `actionId`). The LLM picks exactly one mutation per turn. The PR body's "Why Ralph" paragraph argues for this split; confirm you agree before approving the shape.
- **`dispatch_expert` resolution ladder (`bot/tools/dispatch_expert.ts` + `bot/lib/concrete-experts.ts`).** Fix 2 landed this: catalog cache from `list_experts` (one fetch per task, pending‑promise guard) → `CONCRETE_EXPERT_IDS` short‑circuit for Phase‑2 stubs → peer dispatch via `attest-expert-<id>` slug. The hardcoded `CONCRETE_EXPERT_IDS` is flagged as deferred (collapses when attest‑mcp advertises `ported: boolean`).
- **Per‑validator tool wiring (`validatorScriptToToolName`, `bot/lib/attest-stub-tools.ts`).** Fix 1 landed this: Ralph prompt now steers the agent to `phase_gate_check` → `plannedValidators[]` → `validate_<name>` tools (matching attest‑mcp's real 77‑tool surface), not a fictional single `validate(name)`.
- **Peer connection files (`bot/mcp-connections/attest-expert-{security-auditor,code-reviewer,landscape-mapper}.ts`).** Filename equals peer slug so `host.mcp.callTool(slug, "ask", …)` works without translation. BDK rejects nested connection directories — do not refactor these into a subfolder.
- **Entry points (`bot/channels/autopilot.ts`, `bot/channels/github.ts`, `bot/tools/run_autopilot_task.ts`).** HTTP, chat tool, and GitHub comment gate. The GitHub channel still returns `{ auth }` (chat‑style) rather than `{ task }` (server‑side loop) — flagged as deferred.
- **Safe to skim:** `evals/ralph-pattern/*` (three cases, soft‑assert on preferred moves) and the 11 state‑mutation tools under `bot/tools/` (each is a thin wrapper over `conductor-state.ts`).

### [#5 — feat: cross-package integration + e2e eval](https://github.com/bmatthews-dexcom/attest/pull/5)

- **Size:** +26,801 / −454 across 416 files — but the actual new content is small; most of the diff is the four `--no-ff` merge commits. The *integration* contribution is additive and listed below.
- **Must-read tree:** `scripts/integration-smoke.mjs`, `evals/fixtures/trivial-repo/{README.md,package.json,src/login.js}`, `packages/attest-conductor/evals/integration/attest-e2e.eval.ts`, and the "Cursor target architecture" section added to the top‑level `README.md`. That is the entire new surface.
- **`scripts/integration-smoke.mjs` self‑re‑exec trick.** `#!/usr/bin/env -S node --import tsx` doesn't work (tsx tries to parse `-S`); `register("tsx/esm", …)` is deprecated. The script re‑execs itself with `--import tsx` and an `ATTEST_SMOKE_UNDER_TSX=1` sentinel to break the recursion. Exit codes: 0 ok, 1 assertion fail, 2 missing `CURSOR_API_KEY` in `--real` mode.
- **Three fixes that landed on feature branches, not here.** Documented at the top of the body: Fix 1 (per‑validator dispatch) and Fix 2 (MCP experts catalog) on PR #3's branch; Fix 3 (`invoke-attest-conductor` wired to real MCP + conductor server in `.cursor/mcp.json`) on PR #1's branch. If you review this PR, those commits are already in #1 and #3 — do not expect them in the integration diff.
- **No cross‑branch rewrites.** PR #2 and PR #4 received only cross‑ref body updates; no code changes landed on their branches during integration.
- **Safe to skim:** the four merge commits (`e2f8531`, `8c8ada7`, `3058b02`, `4f1ffc4`) and the fixture files.

## 4. One-command local verification

Run from a scratch directory. **Do not use `--depth 1`** — three validator‑fixture tests assert on specific commit SHAs that must exist in `.git/`.

```bash
git clone --branch cursor/attest-integration-4196 \
  https://github.com/bmatthews-dexcom/attest.git \
  && cd attest \
  && npm ci \
  && npm test \
  && node scripts/integration-smoke.mjs --stub
```

Expected tail:

```
724 passed, 0 failed
…
integration-smoke OK (9 assertions passed)
```

Verified from a fresh clone of `cursor/attest-integration-4196` while writing this doc.

## 5. Known deferreds

Flagged in `notes.md` and the four internal reports; none block the five PRs from merging.

- **Phase 2 expert ports.** 81 BDK agents refuse with `{ ok: false, status: "not_ported" }`. Deferred because this is bulk persona rewriting that should land in a separate wave once the orchestration surface is stable.
- **BDK deploy to Cursor hosting.** Needs the user's own Cursor credential; not an agent task.
- **Live `--real` smoke + `attest-e2e` eval.** Both work locally only when `CURSOR_API_KEY` (or `CURSOR_SERVICE_ACCOUNT_KEY`) is set — the smoke exits 2 with a clean message when it isn't.
- **`list_experts.ported: boolean` on attest‑mcp.** Would collapse the conductor's hardcoded `CONCRETE_EXPERT_IDS` to a catalog filter. Follow‑up PR on PR #2's package.
- **Design report snake_case sweep (`docs/attest-cursor-integration.md`).** The design doc still uses dotted MCP tool names (`attest.route`, `attest.gate.run`, `attest.validate.<name>`); the shipped surface is snake_case (`route_goal`, `phase_gate_check`, `validate_<name>`). Doc‑only, non‑blocking.
- **GitHub channel task‑shaped handler.** Conductor's `bot/channels/github.ts` `onComment` still returns `{ auth }`. Flip to `{ task }` so GitHub triggers run full server‑side Ralph loops without a chat session.
- **Full feature parity port of `scripts/conductor/conductor.mjs`.** The OpenCode‑era conductor also does worktree claim / verify / merge. The BDK conductor is the orchestration brain only; hooks + build target cover the worktree surface in Cursor, but a complete port is still outstanding.
- **GitHub Actions matrix for `scripts/integration-smoke.mjs`.** PR #5 flags adding a job that runs `--stub` on every PR and `--real` on push‑to‑main (needs a Cursor credential in Actions secrets).
- **Planted‑defect fixture for the e2e eval.** `evals/fixtures/trivial-repo/src/login.js` is a single file; replacing it with a planted‑defect module per cluster would let the eval assert on concrete finding categories, not just terminal moves.

## 6. Who to ping for what

| PR | Area | Owning package / files |
|---|---|---|
| [#1](https://github.com/bmatthews-dexcom/attest/pull/1) | Cursor build target | `scripts/build-target-cursor.mjs`, `.cursor/*`, `.github/workflows/ci.yml` |
| [#2](https://github.com/bmatthews-dexcom/attest/pull/2) | MCP server (validators + phase gate + routing + experts catalog) | `packages/attest-mcp/` |
| [#3](https://github.com/bmatthews-dexcom/attest/pull/3) | BDK orchestrator / Ralph loop | `packages/attest-conductor/` |
| [#4](https://github.com/bmatthews-dexcom/attest/pull/4) | BDK expert pack (3 concrete + 81 stubs) | `packages/attest-experts/` |
| [#5](https://github.com/bmatthews-dexcom/attest/pull/5) | Cross‑package integration + e2e eval | `scripts/integration-smoke.mjs`, `evals/fixtures/trivial-repo/`, `packages/attest-conductor/evals/integration/attest-e2e.eval.ts`, top‑level `README.md` |
