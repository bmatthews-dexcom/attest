# attest expert — game-producer (STUB)

**Cluster:** game   **Attest source:** `agents/game/game-producer.md`

Game production specialist — lifecycle gates on builds (prototype kill-criteria → vertical slice → alpha feature-lock → beta content-lock → cert → gold), milestone schedules, scope control, indie vs AAA mode, and indi…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
