# `@bpmforge/attest-conductor`

The **Shape-2 orchestrator** for attest on Cursor. A BDK agent built on
the **Ralph Wiggum loop pattern**: dumb outer loop in TypeScript, LLM
in the inner loop. See the design report at
`docs/attest-cursor-integration.md` (project store copy) for why
Shape-2 puts the orchestrator at the center, and the Ralph section
below for why the TS stays dumb on purpose.

## Status

**Phase-2 working skeleton.** The Ralph loop driver, idempotent
state-mutation tools, three Ralph-pattern evals + one e2e eval,
`run_autopilot_task` chat entry, HTTP `/v1/channels/autopilot/run`
entry, and GitHub channel wiring are all complete and clean against
`main`. Real expert runs light up when the sibling
`packages/attest-experts/` publishes its agent slugs (one env var per
expert — no code changes here).

## The Ralph loop

Classic Ralph: the TypeScript owns a bounded `while (!stop)` loop. The
LLM owns the thinking. Each iteration is:

```
loop:
  state = kv.load(taskId)                              // kv is source of truth
  stop = shouldStop(state)                              // TS-owned thresholds
  if stop: break
  if needsCompaction(state): sendCompactPrompt()
  prompt = renderRalphPrompt(state, goal, sdlc_rules)   // constant template
  agent.run(prompt, tools=[...])                        // ONE agent turn
  // agent's single tool call mutates state in kv
```

**The TS does not** encode `if phase === "build" then dispatch
code-reviewer`. New behavior goes into one of:

- **attest-mcp** — SDLC rules (phases, validators-per-phase, gate
  conditions). The agent reads them each turn via MCP tools /
  resources.
- **the tool palette** — `dispatch_expert`, `validate` (mcp),
  `phase_gate_check` (mcp), `advance_phase`, `conductor_record_finding`,
  `update_scratchpad`, `compact_state`, `mark_done`, `escalate`.
- **the Ralph prompt** — the one template rendered each iteration
  (`bot/lib/ralph-loop.ts`).

### Why Ralph instead of imperative orchestration

An imperative driver (`switch (state.phase)` → `dispatch(expert).then(validate).then(gate)`)
locks every policy decision at compile time: adding a new validator or
re-ordering a heal attempt means editing TS. attest's SDLC rules change
far more often than its runtime shape does; a Ralph loop treats the
rules as data (loaded from attest-mcp each turn) and the state as the
only thing worth re-rendering between iterations. The frontier LLM is
*already* a competent orchestrator for one bounded step at a time —
Ralph just gives it a fresh, consistent view every turn, keeps a kv
checkpoint, and enforces the few genuinely TS-owned invariants (hard
iteration cap, wall-time cap, consecutive-no-progress cap, idempotency,
compaction trigger).

### What the TS *does* own

- The loop driver (`while (!shouldStop)`), one entry per surface:
  - **HTTP channel**: `POST /v1/channels/autopilot/run` →
    `bot/channels/autopilot.ts`.
  - **Chat / eval**: `run_autopilot_task` server tool →
    `bot/tools/run_autopilot_task.ts`.
  - **GitHub**: `onComment` returns `{ task: () => runRalphLoop(...) }`
    → `bot/channels/github.ts` (TODO wire-up — currently just dispatches
    a model turn; a follow-up PR flips it to the task-shaped run).
- Loading / saving task state from `ctx.host.kv` (`conductor:task:<id>`).
- Rendering the Ralph prompt (`renderRalphPrompt`).
- Enforcing escalation thresholds (`shouldStop`): iteration cap, wall
  time cap, consecutive-no-progress cap, agent-decided done/escalate.
- Triggering compaction: when `approxStateSize(task) > budget` and the
  agent hasn't yet set a `scratchpad`, the loop driver sends a one-shot
  "compact your state" prompt before the next real Ralph turn.
- Idempotency: every mutating tool takes `actionId`; the task's
  `actionCache` short-circuits a duplicate so a crash-and-resume cannot
  double-execute.

### What the LLM owns (per turn)

Given the Ralph prompt (state + SDLC rules + experts + validators +
tool palette), pick **one** meaningful tool action:

| tool | typical trigger |
| --- | --- |
| `dispatch_expert` | A unit of expert work is next. |
| `validate` (attest-mcp) | Run one validator on scope. |
| `phase_gate_check` (attest-mcp) | Check the current phase's gate. |
| `advance_phase` | Gate approved a transition. |
| `conductor_record_finding` | A gap / soft issue / halt surfaced. |
| `update_scratchpad` | Rewrite short working notes for next turn. |
| `compact_state` | TS loop asked for a summary. |
| `mark_done` | Goal achieved — the loop ends. |
| `escalate` | Stuck — the loop ends with `escalated: true`. |

Then end the turn. The TS loop re-prompts with the new state.

## Spawning sibling expert agents

See `internal/attest-conductor.md` in the project store for the full
walk-through on BDK's spawn surfaces. Short version:

- **BDK peer MCP connections** (`defineConnection({ agent: "<slug>" })`,
  routed via `host.mcp.callTool(slug, "ask", { message })`) — the
  cleanest native pattern when the conductor and the experts are
  co-deployed on one serve host (multi-mode). **Chosen** for co-deploy.
- **HTTP fallback** (`fetch("<url>/v1/session", …)`) — used when the
  experts are deployed separately.
- Both hidden behind one server tool `dispatch_expert`, selected per
  expert id by env var at serve time:

```sh
# experts co-deployed with the conductor on one serve host
ATTEST_EXPERT_SECURITY_REVIEWER_PEER=attest-security-reviewer \
ATTEST_EXPERT_CODE_REVIEWER_PEER=attest-code-reviewer \
  bdk serve --dir packages/attest-conductor --mode multi

# or a remote deploy
ATTEST_EXPERT_SECURITY_REVIEWER_URL=https://attest-security-reviewer.cursor-hosted.example \
  bdk serve --dir packages/attest-conductor
```

With neither env var set, `dispatch_expert` falls through to **stub
mode**: returns a canned response good enough for every eval in this
package.

## Entry points

| trigger | behavior |
| --- | --- |
| `/autopilot <goal>` (chat) | Agent calls `run_autopilot_task` → Ralph loop. |
| `/autopilot resume` (chat) | Agent reads active-task pointer, re-enters the loop with the same `taskId`. |
| `/autopilot status` (chat) | Agent calls `conductor_get_state`, replies read-only. |
| `POST /v1/channels/autopilot/run` `{ goal }` | HTTP entry; same loop. |
| GitHub issue / PR / review comment starting with `/autopilot …` | `bot/channels/github.ts` dispatch. |

## Package layout

```
packages/attest-conductor/
├── package.json              name: @bpmforge/attest-conductor
├── tsconfig.json             strict + noEmit (tsx handles execution)
├── README.md                 (this file)
├── AGENTS.md                 BDK scaffold notes for coding agents
├── bot/
│   ├── agent.ts              defineAgent({})
│   ├── instructions.md       short, Ralph-aware
│   ├── lib/
│   │   ├── conductor-state.ts    per-task kv model + idempotency helpers
│   │   ├── ralph-loop.ts         prompt renderer + shouldStop + compaction
│   │   ├── attest-stub-tools.ts  inline stub for attest-mcp
│   │   └── experts-registry.ts   known experts + env resolver
│   ├── mcp-connections/
│   │   └── attest.ts         switches stub ↔ real attest-mcp by env
│   ├── tools/
│   │   ├── conductor_begin.ts
│   │   ├── conductor_get_state.ts
│   │   ├── conductor_record_finding.ts
│   │   ├── advance_phase.ts
│   │   ├── mark_done.ts
│   │   ├── escalate.ts
│   │   ├── update_scratchpad.ts
│   │   ├── compact_state.ts
│   │   ├── dispatch_expert.ts     stub / peer / http (idempotent)
│   │   ├── list_experts.ts
│   │   └── run_autopilot_task.ts  chat/eval entry — drives Ralph loop
│   └── channels/
│       ├── autopilot.ts      POST /run — HTTP entry, drives Ralph loop
│       └── github.ts         `/autopilot` dispatch gate
├── evals/
│   ├── evals.config.ts
│   ├── autopilot-e2e.eval.ts         e2e — full Ralph loop via chat trigger
│   └── ralph-pattern/
│       ├── early-phase.eval.ts        unit — fresh task, not a terminal move
│       ├── mid-phase-blocked.eval.ts  unit — heal ladder at the end
│       └── final-phase-done.eval.ts   unit — gate done, must mark_done
└── test/
    ├── conductor-state.test.mjs
    ├── experts-registry.test.mjs
    └── ralph-loop.test.mjs
```

## Verify (BDK invariants)

```sh
cd packages/attest-conductor
npx tsc --noEmit                             # strict typecheck
npm test                                     # tsc + node --test (tsx loader)
npx tsx bot/agent.ts                         # agent module loads cleanly
npx @cursor/bdk validate --dir .             # BDK diagnostic pass
npx @cursor/bdk info --dir . --json          # tool / channel catalog
npx @cursor/bdk eval --dir . --list          # all four evals register
```

All six currently pass clean on `main`. 19 unit tests cover the state
model + idempotency helpers + Ralph loop driver (prompt renderer, stop
thresholds, compaction trigger).

Running the evals needs a Cursor credential (`CURSOR_API_KEY`,
`CURSOR_API_KEY_FILE`, `CURSOR_SERVICE_ACCOUNT_KEY`, or
`bdk login`). Without one, `bdk eval` prints the expected
`BDK needs a Cursor credential to run turns` error — a BDK framework
invariant, not a bug in the skeleton.

With a credential set:

```sh
npx @cursor/bdk eval --dir .                            # all 4
npx @cursor/bdk eval --dir . --tag ralph                # 3 unit cases
npx @cursor/bdk eval --dir . autopilot-e2e              # e2e only
npx @cursor/bdk eval --dir . ralph-pattern/early-phase
```

## Dev loop

```sh
npx @cursor/bdk dev --dir packages/attest-conductor
# then open http://127.0.0.1:3000/playground
```

Send `/autopilot harden the login flow` and watch
`run_autopilot_task` start the loop. Each Ralph sub-turn's tool trail
is visible in the trace.

To invoke the HTTP entry directly:

```sh
curl -X POST http://127.0.0.1:3000/v1/channels/autopilot/run \
  -H 'content-type: application/json' \
  -d '{"goal":"harden the login flow","iterationCap":3,"maxTurns":5}'
```

## Pointing at the real `attest-mcp`

Once `feat/attest-mcp` publishes:

```sh
ATTEST_MCP_COMMAND=npx \
ATTEST_MCP_ARGS='["-y","@bpmforge/attest-mcp"]' \
  npx @cursor/bdk dev --dir packages/attest-conductor
```

Local sibling build:

```sh
ATTEST_MCP_COMMAND=node \
ATTEST_MCP_ARGS='["../attest-mcp/dist/stdio.js"]' \
  npx @cursor/bdk dev --dir packages/attest-conductor
```

### Expected attest-mcp tool contract (flagged for the sibling worker)

| tool | input | expected output shape |
| --- | --- | --- |
| `route_goal` | `{ goal, context?, currentPhase? }` | `{ expert, rationale, nextPhase, unit: { id, description, writeScope }, expectedValidators: string[] }` |
| `list_validators` | `{ phase? }` | `{ validators: Array<{ name, description }> }` |
| `validate` | `{ name, scope? }` | `{ name, ok, severity: "gate"\|"soft", gaps, receipt }` |
| `phase_gate_check` | `{ phase }` | `{ phase, status: "green"\|"holds"\|"done", gaps, nextPhase, receiptPath }` |

The design report lists dotted variants (`attest.route`,
`attest.validate.<name>`, `attest.gate.run`, `attest.gate.current`). If
the real `attest-mcp` ships dotted names, either (a) rename the inline
stub tools + prompt refs, or (b) have attest-mcp also publish
snake_case aliases. **PR body flags this to the sibling worker.**

## GitHub channel

`bot/channels/github.ts` dispatches when an issue title/body or an
issue/PR comment starts with `/autopilot …`. Named secrets only (BDK v2
pattern): `GITHUB_WEBHOOK_SECRET`, `GITHUB_APP_ID`,
`GITHUB_APP_PRIVATE_KEY`. The dispatch currently returns
`{ auth: defaultGitHubAuth(ctx) }` which starts a chat-style turn;
a follow-up PR flips it to `{ task: () => runRalphLoopHere(...) }` so
the full Ralph loop runs server-side without a chat session.

## Deploy as a Cursor cloud agent

```sh
cd packages/attest-conductor
npx @cursor/bdk login              # one-time
npx @cursor/bdk deploy
```

Follow the hillclimb skill
(`node_modules/@cursor/bdk/skills/hillclimb/SKILL.md`) once the sibling
packages land and the stubs can be swapped out for real wires.

## Related

- Design report: `docs/attest-cursor-integration.md` (project store)
- Sibling package: `packages/attest-mcp/` (owns `route_goal`,
  validators, `phase_gate_check`, SDLC rules)
- Sibling package: `packages/attest-experts/` (owns each primary
  expert as a deployable BDK agent)
- Source conductor being ported: `scripts/conductor/conductor.mjs`
- Source autopilot behavior: `skills/autopilot/SKILL.md`
