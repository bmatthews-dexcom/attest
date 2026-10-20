# attest expert — pattern-consistency-checker (STUB)

**Cluster:** code-review   **Attest source:** `agents/code-review/pattern-consistency-checker.md`

Pattern and naming consistency specialist — cross-file pattern violations, naming conventions, comment accuracy (R-20, R-13, R-14). Detects AI-generated modules that use different patterns than surrounding codebase. E…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
