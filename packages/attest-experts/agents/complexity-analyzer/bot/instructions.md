# attest expert — complexity-analyzer (STUB)

**Cluster:** code-review   **Attest source:** `agents/code-review/complexity-analyzer.md`

Code complexity specialist — cyclomatic complexity, cognitive complexity, function length, nesting depth. Runs lizard/radon/complexity tools plus manual analysis. Identifies functions that are too complex to safely ma…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
