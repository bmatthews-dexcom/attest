# attest expert — test-engineer (STUB)

**Cluster:** primary   **Attest source:** `agents/test-engineer.md`

Senior test engineer — Playwright e2e, vitest/jest unit tests, integration tests, test strategy, coverage analysis. Use when writing tests or designing test strategy. Proactive: after implementing any feature, or when…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
