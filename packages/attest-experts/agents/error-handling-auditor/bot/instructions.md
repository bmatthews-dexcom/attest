# attest expert — error-handling-auditor (STUB)

**Cluster:** code-review   **Attest source:** `agents/code-review/error-handling-auditor.md`

Error handling and silent failure specialist — empty catch blocks, exception-driven control flow, swallowed errors, missing error boundaries, serial awaits vs Promise.all. Enforces R-01 through R-04. Veracode 2025: er…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
