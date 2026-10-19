# attest expert — perf-synthesizer (STUB)

**Cluster:** performance   **Attest source:** `agents/performance/perf-synthesizer.md`

Performance master synthesizer — reads all specialist findings, identifies compounding slowdowns (slow query hitting in a hot O(n²) loop + no caching = multiplicative), produces final PERFORMANCE_REPORT with prioritiz…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
