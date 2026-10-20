# `@bpmforge/attest-ceo`

The **CEO** of attest on Cursor — a BDK agent that sits above
`@bpmforge/attest-conductor` (the chief) and owns the roadmap,
discussion ingestion, intent extraction, plan drafting, approval
round-trip, and dispatch to the chief. Phase 1 of the design doc at
`/cursor/stores/.../docs/attest-ceo-architecture.md`.

## Status

   10|**Phase 1 skeleton, local-only.** Private workspace package (`"private":
true`). Not published to npm. Source lives on your personal GitHub
(`bmatthews-dexcom/attest`). Local dev via
`npx @cursor/bdk dev --dir packages/attest-ceo`; hosted deploy via
`npx @cursor/bdk deploy` from this directory (needs `CURSOR_API_KEY`,
NOT npm).

The Phase 1 slice is deliberately narrow:

   20|- **Cursor chat ingestion only.** Bradford pastes a Slack thread,
  Linear description, GitHub comment, or meeting block as text; the
  CEO extracts intents. Native Slack / Linear / GitHub / meeting-notes
  webhook ingestion is Phase 2.
- **Default autonomy `draft-and-approve`.** The CEO extracts, drafts,
  surfaces an awaiting-approval plan, and stops. Dispatch only runs on
  explicit `/ceo approve` (unless autonomy is `auto-dispatch`).
- **Director feature-flagged OFF.** `director_create_expert` returns a
  deterministic stub until `ATTEST_DIRECTOR_ENABLED=1` is set.

   30|## Chat surface

The agent recognizes `/ceo` sub-commands:

| user says | tool | effect |
| --- | --- | --- |
| `/ceo status` | `ceo_status` | counts + autonomy + awaiting plans + in-flight chief tasks |
| `/ceo roadmap` | `ceo_roadmap` | ordered initiative list with linked commitments |
| `/ceo set-autonomy <mode>` | `ceo_set_autonomy` | flip to `watch` / `nudge` / `draft-only` / `draft-and-approve` / `auto-dispatch` |
| `/ceo ingest …text…` | `ceo_ingest` | normalize + extract intents + draft plan if top intent crosses the confidence floor |
   40|| `/ceo approve <plan-id>` | `ceo_approve` | approve + build dispatch blueprint + fire `run_autopilot_task` on the chief per step |
| `/ceo deny <plan-id>` | `ceo_deny` | mark plan `denied`; no dispatch |
| `/ceo refine <plan-id> …notes…` | `ceo_refine` | produce v+1 plan version with revised title + rationale |

Internal driver (not a chat entry):

- `run_ceo_turn` — Ralph-style outer turn. Reconciles any closed chief
  tasks via `attest-mcp.read_task_completion`, renders the next-step
  prompt. Called on serve restart, on `/ceo` without a sub-command, on
  a chief-completion notification, or (Phase 3) on a cron digest.

   50|## Memory

Durable state lives in `ctx.host.kv`, never in module globals (serve
host can be replaced between turns — BDK framework invariant 7). Keys:

| key | shape |
| --- | --- |
| `ceo:ledger:current` | the full `CeoLedger` — roadmap, commitments, plans, decisions, discussions, tasks, autonomy mode |
| `ceo:roadmap:current` | mirror of `ledger.roadmap` for cheap reads |
   60|| `ceo:commitments:open` | mirror of `open` + `in-flight` commitments |
| `ceo:plans:awaiting` | mirror of `awaiting-approval` plans |

Every mutating tool reads the full ledger, applies a pure mutator, and
writes back through `writeLedger`, which also re-publishes the mirrors.
See `bot/lib/ceo-state.ts`.

## Autonomy modes

| mode | behavior |
   70|| --- | --- |
| `watch` | ingest only; no plan draft, no dispatch. |
| `nudge` | ingest; draft plans; never dispatch; expect the CEO to nudge Bradford conversationally. |
| `draft-only` | ingest; draft plans; **do not** mark them `awaiting-approval` or dispatch. |
| `draft-and-approve` | **default.** ingest; draft; mark `awaiting-approval`; dispatch only on explicit `/ceo approve`. |
| `auto-dispatch` | ingest; draft; auto-approve; dispatch immediately via `run_autopilot_task`. |

Flipped with `/ceo set-autonomy <mode>`. Logged in the decision ledger.

## MCP connections

   80|Three sibling MCP connections, each with an inline stub for
credential-free running (tests, evals, `scripts/integration-smoke.mjs
--stub`):

| connection | real server | stub mode |
| --- | --- | --- |
| `attest-ceo-mcp` | `@bpmforge/attest-ceo-mcp` (sibling in this workspace) | ingest / extract / draft / approve / dispatch / director surfaces run in-process via the shared package source. |
| `attest-conductor` | `@bpmforge/attest-conductor` BDK agent | `run_autopilot_task` returns a canned `task_stub_<n>` dispatch handle. |
| `attest` | `@bpmforge/attest-mcp` | `read_task_status` returns `mockTaskStatus` from the shared package; `read_task_completion` returns `{ present: false }` for all taskIds (Shape C placeholder). |

   90|Switch to the real servers by setting the matching env vars:

```sh
# Real attest-ceo-mcp (local workspace build):
ATTEST_CEO_MCP_COMMAND=node \
ATTEST_CEO_MCP_ARGS='["packages/attest-ceo-mcp/dist/cli.js"]' \
  npx @cursor/bdk dev --dir packages/attest-ceo

# Real attest-conductor (peer BDK agent on the same multi serve host):
ATTEST_CONDUCTOR_MCP_COMMAND=node \
   100|ATTEST_CONDUCTOR_MCP_ARGS='["<path-to-bdk>/dist/bin/agent-serve.js","serve","--dir","packages/attest-conductor"]' \
  npx @cursor/bdk dev --dir packages/attest-ceo

# Real attest-mcp (sibling in this workspace):
ATTEST_MCP_COMMAND=node \
ATTEST_MCP_ARGS='["packages/attest-mcp/dist/stdio.js"]' \
  npx @cursor/bdk dev --dir packages/attest-ceo
```

> TODO(ceo): switch to the real `attest://tasks/<id>/completion.json`
   110|> resource read when `@bpmforge/attest-mcp` Shape C merges. Marked
> inline in `bot/mcp-connections/attest.ts` and
> `bot/tools/run_ceo_turn.ts`.

## Package layout

```
packages/attest-ceo/
├── package.json              name: @bpmforge/attest-ceo, "private": true
├── tsconfig.json             strict + noEmit (tsx runs bot/ directly)
   120|├── README.md                 (this file)
├── AGENTS.md                 BDK scaffold notes for coding agents
├── bot/
│   ├── agent.ts              defineAgent({}) — tools/mcp/instructions autodiscovered
│   ├── instructions.md       always-on prompt
│   ├── schema.ts             zod schemas for ledger, plans, intents, autonomy
│   ├── lib/
│   │   ├── ceo-state.ts          kv model + ledger helpers
│   │   ├── ceo-loop.ts           Ralph-style outer prompt renderer
│   │   └── ceo-mcp-stub-tools.ts in-process stand-in for attest-ceo-mcp
   130|│   ├── mcp-connections/
│   │   ├── attest-ceo-mcp.ts     env-driven: stub ↔ stdio server
│   │   ├── attest-conductor.ts   env-driven: stub ↔ peer BDK agent
│   │   └── attest.ts             env-driven: stub ↔ attest-mcp
│   └── tools/
│       ├── ceo_status.ts
│       ├── ceo_roadmap.ts
│       ├── ceo_set_autonomy.ts
│       ├── ceo_ingest.ts
│       ├── ceo_approve.ts
   140|│       ├── ceo_deny.ts
│       ├── ceo_refine.ts
│       └── run_ceo_turn.ts
├── evals/
│   ├── evals.config.ts
│   ├── roadmap-read.eval.ts
│   ├── intent-extraction.eval.ts
│   ├── plan-approve-round-trip.eval.ts
│   ├── dispatch-blueprint.eval.ts
│   └── resume-on-completion.eval.ts
   150|└── test/
    ├── ceo-state.test.mjs
    └── ceo-loop.test.mjs
```

## Verify

```sh
cd packages/attest-ceo
npx tsc --noEmit                            # strict typecheck
npm test                                    # tsc + node --test
   160|npx @cursor/bdk validate --dir .            # BDK diagnostic pass
npx @cursor/bdk info --dir . --json         # tool / channel catalog
npx @cursor/bdk eval --dir . --list         # all 5 evals register
```

Running the evals needs a Cursor credential (`CURSOR_API_KEY` or
`bdk login`). Without one the evals fail with the framework's expected
`BDK needs a Cursor credential to run turns` message — not a bug in
the skeleton.

   170|## Dev loop

```sh
npx @cursor/bdk dev --dir packages/attest-ceo
# then open http://127.0.0.1:3000/playground
```

Send `/ceo status` or `/ceo ingest …` and watch the ledger tool trail
and the stub dispatch into the attest-conductor stub.

   180|## Deploy

Hosted deploy (needs `CURSOR_API_KEY` only — **not npm**):

```sh
cd packages/attest-ceo
export CURSOR_API_KEY=...   # from Cursor Dashboard → Cloud Agents → Secrets
npx @cursor/bdk deploy
```

   190|The source stays on `bmatthews-dexcom/attest`. Nothing in this
package is published to the npm registry.

## Phase 2+ (deliberately out of scope here)

- Native Slack / Linear / GitHub / meeting-notes webhook ingestion.
- Zep (or equivalent) temporal knowledge graph for cross-episode recall.
- Proactive nudging (CEO reaches out when a commitment is stale).
- Dashboards, multi-user CEO, auto-dispatch as default.
- Director handoff that actually mints an expert agent + deploys it via
   200|  `npx @cursor/bdk deploy` with `CURSOR_API_KEY` (never npm).
- Shape C on `@bpmforge/attest-mcp`: real `attest://tasks/<id>/status.json`
  and `attest://tasks/<id>/completion.json` resource reads for the CEO's
  reconciliation path.

## Related

- Sibling package: `packages/attest-ceo-mcp/` (owns ingest / extract /
  draft / approve / dispatch / director tools + resources)
- Sibling package: `packages/attest-conductor/` (the chief — Ralph loop)
   210|- Sibling package: `packages/attest-mcp/` (SDLC rules, validators)
- Sibling package: `packages/attest-experts/` (concrete expert agents)
- Design doc: `/cursor/stores/.../docs/attest-ceo-architecture.md`
