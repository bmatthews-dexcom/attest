# attest expert — task-decomposer (STUB)

**Cluster:** primary   **Attest source:** `agents/task-decomposer.md`

Task decomposition specialist — turns any request into a typed DAG of bounded leaf tasks (plan.json) sized for small-context models. Use before multi-step work, when a request spans 3+ files or 2+ specialists, or when…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
