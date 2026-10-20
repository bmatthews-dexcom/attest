# `@bpmforge/attest-conductor` — Shape C hybrid chief

The **Shape C hybrid chief** for attest on Cursor. A BDK agent that owns
the task + SDLC state machine, dispatches experts through a
policy-mediated single entry point in attest-mcp, and routes HITL asks
over MCP elicitation or GitHub comment-approve. Driven by the **Ralph
Wiggum loop pattern**: dumb outer loop in TypeScript, LLM in the inner
loop.

The architecture rationale lives in
`docs/attest-chief-architecture.md` (project store); the per-shape
comparison lives there as §3. This package implements Shape C's
`attest-conductor` section (§8.3) — minor additive changes on top of
the Shape-A skeleton.

## Status

**Shape C in-progress.** The policy-mediated `invoke_expert` call,
`pre_dispatch_check` preview tool, HITL `request_approval` (MCP
elicitation + GitHub comment-approve), `set_autonomy_mode` tool,
autonomy-mode task state, and `/approve` / `/deny` GitHub channel reply
handling are all in. Real end-to-end runs still require the sibling
`@bpmforge/attest-mcp` Shape-C PR (owner of the Cedar/OPA policy engine
and the sandbox-vs-in-process routing).

## The Shape C dispatch flow

```
    Ralph loop  ──►  pre_dispatch_check   (preview policy decision)
                       │
                       ├── allow              ──►  invoke_expert
                       │                              │
                       │                              ├── expert_output   ──►  consume, Ralph next turn
                       │                              ├── policy_denied   ──►  escalate / route differently
                       │                              └── approval_required ──► request_approval → retry
                       │
                       ├── deny               ──►  escalate / record_finding
                       │
                       └── requires-approval  ──►  request_approval
                                                     │
                                                     ├── approved   ──►  invoke_expert with approvalId
                                                     ├── denied     ──►  escalate / route differently
                                                     └── timeout    ──►  denied (fail-closed)
```

attest-mcp is the authoritative policy chokepoint — it decides
`allow` / `deny` / `requires-approval` on every `invoke_expert` call,
and routes approved work to the in-process handler OR a sandbox BDK
expert depending on the capability map. The conductor's Ralph TS has
zero transport logic; the Shape-A `dispatch_expert` tool's PEER / URL /
stub switch is gone.

## Autonomy modes

Three modes, settable at task creation (`run_autopilot_task(...)`,
`/autopilot --autonomy <mode>`, GitHub `[autonomy: <mode>]`) and
mid-task via `set_autonomy_mode`:

| mode | HITL asks on | When to use |
| --- | --- | --- |
| `auto` (default) | destructive capabilities only (`shell:destructive`, `write:fs`, `write:src`, `git:write`, `pr:*`, `publish:*`); fail-closed when no HITL transport is attached | Trusted overnight autopilot runs where you want HITL only when the chief is about to touch real artifacts. |
| `approve-each` | every destructive op | After a bad run — "please double-check me on everything." Especially appropriate when a validator keeps flagging the chief's recent moves. |
| `approve-destructive` | destructive capabilities (same matcher as `auto`) but **always** asks (`auto` can auto-approve the policy-mediated `requires-approval` outcome for an already-trusted sub-capability) | Mixed trust: autopilot handles reads, analysis, routing, test writing, but every source edit / PR comment / publish gets a human glance. |

`auto` vs `approve-destructive` note: both ask on destructive. The
difference is that `auto` + non-destructive is auto-approved even if
the policy engine says `requires-approval` (the autonomy mode overrides
down); `approve-destructive` honors the policy engine's `requires-
approval` on destructive ops without exception, and the `pr:*` /
`publish:*` subset even prefers the GitHub paper trail over MCP
elicitation when both transports are attached.

## HITL transports

| transport | when it fires | failure |
| --- | --- | --- |
| **MCP elicitation** | MCP client advertises `elicitation` capability. Preferred when both transports exist (except see paper-trail rule below). The conductor calls `attest.request_approval` under the hood which runs the elicitation. | Call failure → fail-closed on this ask (reason surfaces to Ralph; `approved: false, source: "mcp"`). |
| **GitHub comment-approve** | Task has a `githubContext` (originated from `/autopilot` on an issue / PR). Also preferred over MCP elicitation when autonomy is `approve-destructive` and capability is `pr:*` / `publish:*` (paper trail). Posts a comment on the originating PR/issue carrying an HTML marker; polls `ctx.host.kv` for `/approve` / `/deny` reply resolution. Default timeout 24h. | Timeout → `approved: false, source: "timeout"`; also fail-closed. |
| **Fail-closed** | Neither MCP elicitation nor GitHub context is attached. | `request_approval` returns `{ approved: false, reason: "no_hitl_transport", source: "no_transport" }`. The Ralph loop then escalates. |

### GitHub reply shape

The chief's approval comment carries a stable HTML marker:

```
<!-- attest:approval id="approval_abc" task="task_xyz" -->
```

A reviewer replies on the same PR/issue (any comment):

```
/approve
/approve approval_abc looks fine, ship it
/deny
/deny approval_abc hold until QA signs off
```

Without an explicit id, the reply resolves the **oldest pending**
approval on the issue. With an id, it resolves that specific one.
Resolution → kv update → the Ralph loop's `request_approval` poll
picks it up within `pollMs` (default 5s) and returns.

## Entry points

| trigger | behavior |
| --- | --- |
| `/autopilot <goal>` (chat) | Agent calls `run_autopilot_task` → Ralph loop. Accepts `--autonomy {auto\|approve-each\|approve-destructive}`. |
| `/autopilot <goal> [autonomy: approve-each]` (GitHub comment) | Same, with the bracket-directive shape. |
| `/autopilot resume` (chat) | Agent reads active-task pointer, re-enters the loop with the same `taskId`. |
| `/autopilot status` (chat) | Agent calls `conductor_get_state`, replies read-only (includes autonomy mode + pending approvals). |
| `POST /v1/channels/autopilot/run` `{ goal, autonomyMode? }` | HTTP entry; same loop. |
| GitHub issue / PR / review comment starting with `/autopilot …` | Dispatches via `bot/channels/github.ts`. |
| GitHub comment `/approve` / `/deny` | Resolves a pending `request_approval` (host-task, no model turn). |

## Ralph tool palette (Shape C)

| tool | kind | notes |
| --- | --- | --- |
| `invoke_expert` | write (mutating) | Shape-C policy-mediated expert invocation. Three outcomes: `expert_output` / `policy_denied` / `approval_required`. |
| `pre_dispatch_check` | read | Preview the policy decision without invoking. |
| `request_approval` | write (mutating) | HITL ask. MCP elicitation / GitHub comment-approve; fail-closed otherwise. |
| `set_autonomy_mode` | write (mutating) | Mid-task autonomy change. |
| `phase_gate_check` (attest-mcp) | read | Current phase's gate state. |
| `validate_<name>` (attest-mcp) | read | Run one validator (77 total; names from `plannedValidators`). |
| `advance_phase` | write | Phase transition (gate must have approved). |
| `conductor_record_finding` | write | Record gap / soft issue / halt condition. |
| `update_scratchpad` | write | Rewrite short working notes. |
| `compact_state` | write | Summarize prior findings into scratchpad. |
| `mark_done` | write | Goal achieved. Loop ends. |
| `escalate` | write | Stuck. Loop ends with `escalated: true`. |
| `conductor_get_state` | read | Full task record. |
| `list_experts` | read | Local hint catalog (attest-mcp's `list_experts` is authoritative). |

## Package layout

```
packages/attest-conductor/
├── package.json              name: @bpmforge/attest-conductor
├── tsconfig.json             strict + noEmit (tsx handles execution)
├── README.md                 (this file)
├── AGENTS.md                 BDK scaffold notes for coding agents
├── bot/
│   ├── agent.ts              defineAgent({})
│   ├── instructions.md       short, Ralph-aware, Shape-C palette
│   ├── lib/
│   │   ├── conductor-state.ts    per-task kv model + idempotency + autonomy
│   │   ├── ralph-loop.ts         prompt renderer + shouldStop + compaction
│   │   ├── attest-stub-tools.ts  inline stub for attest-mcp (incl. invoke_expert)
│   │   ├── experts-registry.ts   local hint catalog (no env transport switching)
│   │   ├── autonomy.ts           autonomy mode + destructive-capability matcher
│   │   ├── approvals.ts          approval record shape + kv helpers
│   │   ├── github-approval.ts    comment body + reply parser
│   │   ├── invoke-expert.ts      MCP adapter: callInvokeExpert / callPreDispatchCheck
│   │   ├── request-approval-core.ts  HITL transport selection + poll loop
│   │   └── autopilot-parse.ts    /autopilot ... --autonomy ... parser
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
│   │   ├── invoke_expert.ts        Shape-C policy-mediated dispatch (replaces dispatch_expert)
│   │   ├── pre_dispatch_check.ts   Shape-C policy preview
│   │   ├── request_approval.ts     Shape-C HITL
│   │   ├── set_autonomy_mode.ts    Shape-C autonomy
│   │   ├── list_experts.ts
│   │   └── run_autopilot_task.ts   chat/eval entry — drives Ralph loop
│   └── channels/
│       ├── autopilot.ts      POST /run — HTTP entry, drives Ralph loop
│       └── github.ts         /autopilot dispatch + /approve /deny resolver
├── evals/
│   ├── evals.config.ts
│   ├── autopilot-e2e.eval.ts
│   └── ralph-pattern/
│       ├── dispatch-allowed.eval.ts             Shape-C outcome: allowed
│       ├── policy-denied.eval.ts                Shape-C outcome: policy_denied
│       ├── approval-required-approved.eval.ts   Shape-C outcome: approval→approved
│       ├── approval-required-denied.eval.ts     Shape-C outcome: approval→denied
│       └── final-phase-done.eval.ts
└── test/
    ├── conductor-state.test.mjs
    ├── experts-registry.test.mjs
    ├── autonomy.test.mjs
    ├── autopilot-parse.test.mjs
    ├── github-approval.test.mjs
    ├── invoke-expert-lib.test.mjs
    ├── invoke-expert-tool.test.mjs
    ├── pre-dispatch-check.test.mjs
    ├── request-approval-core.test.mjs
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
npx @cursor/bdk eval --dir . --list          # six evals register
```

Running the evals needs a Cursor credential (`CURSOR_API_KEY`,
`CURSOR_API_KEY_FILE`, `CURSOR_SERVICE_ACCOUNT_KEY`, or
`bdk login`). Without one, `bdk eval` prints the expected
`BDK needs a Cursor credential to run turns` error — a BDK framework
invariant, not a bug in the skeleton.

With a credential set:

```sh
npx @cursor/bdk eval --dir .                             # all 6
npx @cursor/bdk eval --dir . --tag shape-c               # 5 unit cases
npx @cursor/bdk eval --dir . autopilot-e2e               # e2e only
npx @cursor/bdk eval --dir . ralph-pattern/dispatch-allowed
```

## Dev loop

```sh
npx @cursor/bdk dev --dir packages/attest-conductor
# then open http://127.0.0.1:3000/playground
```

Send `/autopilot --autonomy approve-each harden the login flow` and
watch `run_autopilot_task` start the loop with each destructive-op
dispatch going through `request_approval` first (fail-closed in dev
unless you've attached a transport).

## Pointing at the real `attest-mcp`

Once the sibling `feat/attest-mcp` Shape-C PR publishes:

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

### Expected attest-mcp Shape-C tool contract

The conductor's Shape-C integration assumes attest-mcp exposes:

| tool | input | expected output |
| --- | --- | --- |
| `invoke_expert` | `{ expertId, taskId, phase?, prompt?, input?, approvalId? }` | one of `{ kind: "expert_output", summary?, result }` / `{ kind: "policy_denied", reason, capability?, ruleId? }` / `{ kind: "approval_required", capability, approver, prompt, destructiveOp?, target? }` |
| `pre_dispatch_check` | `{ expertId, taskId, phase?, scope? }` | `{ decision: "allow" \| "deny" \| "requires-approval", reason?, capability?, ruleId? }` |
| `request_approval` | `{ reason?, destructive_op?, target?, approvalId?, taskId?, capability? }` | `{ approved, by?, reason? }` (SDK-wrapped `content: [{ text: "<json>" }]` also accepted) |
| `route_goal`, `list_validators`, `phase_gate_check`, `list_experts`, `validate_<name>` | — (unchanged from Shape A) | — |

The conductor's TS tolerates both snake_case (`policy_denied`) and
camelCase (`PolicyDenied`) `kind` values, and the SDK-style
`{ content: [{ type: "text", text: "<json>" }] }` wrapper, but throws
`InvokeExpertParseError` on an unknown `kind` so the Ralph loop can
surface a structured error rather than silently misinterpret the
server. See `bot/lib/invoke-expert.ts`.

## Related

- Design report: `docs/attest-chief-architecture.md` (project store) —
  §3.3 (Shape C) and §8.3 (`attest-conductor` migration)
- Sibling package: `packages/attest-mcp/` (owns the Cedar/OPA policy
  engine, `invoke_expert`, `pre_dispatch_check`, `request_approval`
  elicitation path, in-process expert handlers)
- Sibling package: `packages/attest-experts/` (owns the ~15 risky-write
  BDK agents under Shape C classification)
- Earlier design: `docs/attest-cursor-integration.md`
- Shape A baseline: `cursor/attest-conductor-bdk-0ce6` (this branch
  diffs on top)
