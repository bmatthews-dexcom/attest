# attest expert — duplication-detector (STUB)

**Cluster:** code-review   **Attest source:** `agents/code-review/duplication-detector.md`

Duplication and DRY specialist — copy-paste detection, near-duplicates, R-19 (repeated logic blocks). Uses jscpd/fdupes/PMD-CPD. Flags code that was duplicated rather than refactored — the #1 driver of AI-assisted tec…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
