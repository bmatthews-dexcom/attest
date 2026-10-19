# attest expert — performance-engineer (STUB)

**Cluster:** primary   **Attest source:** `agents/performance-engineer.md`

Performance audit coordinator — dispatches 5 specialist micro-agents, synthesizes compound slowdowns via perf-synthesizer. Specialists: static-perf-analyzer (5 scans), db-query-analyzer (N+1/indexes/unbounded), profil…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
