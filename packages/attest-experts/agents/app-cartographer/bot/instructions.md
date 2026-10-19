# attest expert — app-cartographer (STUB)

**Cluster:** primary   **Attest source:** `agents/app-cartographer.md`

End-user guide specialist — builds the page-graph state inventory and the per-state interactive-element inventory of a running app, the double denominator every other guide artifact is graded against. Runs first in th…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
