# attest expert — code-health-synthesizer (STUB)

**Cluster:** code-review   **Attest source:** `agents/code-review/code-health-synthesizer.md`

Code health master synthesizer — reads all 6 specialist outputs, identifies compounding risk (complex + duplicated + bad error handling in same module), produces final CODE_REVIEW with prioritized FIX_BACKLOG. Runs la…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
