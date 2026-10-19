# attest expert — cost-engineer (STUB)

**Cluster:** primary   **Attest source:** `agents/cost-engineer.md`

Cost engineer — cloud + LLM spend analysis, right-sizing, reserved capacity/commitments, cost observability. Use before scaling decisions, after first cloud bill shock, or when unit economics are unknown. NOT for perf…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
