# attest expert — migration-planner (STUB)

**Cluster:** primary   **Attest source:** `agents/migration-planner.md`

Database migration planner — compares two schema states (files or git refs), produces ordered migration steps with rollback plan per step. Proactive: before any schema change that touches existing tables.

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
