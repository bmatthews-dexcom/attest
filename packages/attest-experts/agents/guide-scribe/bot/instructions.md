# attest expert — guide-scribe (STUB)

**Cluster:** primary   **Attest source:** `agents/guide-scribe.md`

End-user guide specialist — the capture engine. Turns app-cartographer''s STORIES.md into replayable JSON step specs, executes them, captures gated annotated screenshots, and triages errors as bug/documented-error/sus…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
