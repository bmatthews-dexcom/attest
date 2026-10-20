# attest expert — concurrency-checker (STUB)

**Cluster:** performance   **Attest source:** `agents/performance/concurrency-checker.md`

Concurrency and async specialist — blocking operations in async paths, unguarded shared state, race conditions in concurrent handlers, missing mutex/lock patterns, unbounded Promise.all causing memory spikes. For Node…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
