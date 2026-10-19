# attest expert — static-perf-analyzer (STUB)

**Cluster:** performance   **Attest source:** `agents/performance/static-perf-analyzer.md`

Static performance analysis specialist — O(n²) nested loops, N+1 query patterns, blocking I/O in async paths, try/catch in hot loops (5-20x slowdown), unnecessary allocations. No profiler needed — finds structural per…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
