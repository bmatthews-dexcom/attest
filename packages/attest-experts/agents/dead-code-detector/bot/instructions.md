# attest expert — dead-code-detector (STUB)

**Cluster:** code-review   **Attest source:** `agents/code-review/dead-code-detector.md`

Dead and unutilized code specialist — unimplemented stubs, functions defined but never called, unused exports, orphan files, unreachable branches, disconnected pipelines (code wired to nothing). Tools: knip/ts-prune (…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
