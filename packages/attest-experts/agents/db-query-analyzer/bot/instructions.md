# attest expert — db-query-analyzer (STUB)

**Cluster:** performance   **Attest source:** `agents/performance/db-query-analyzer.md`

Database query performance specialist — missing indexes, slow query patterns, N+1 at the DB layer, unparameterized queries, missing pagination, unbounded queries on large tables. Checks query shapes in ORM calls and r…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
