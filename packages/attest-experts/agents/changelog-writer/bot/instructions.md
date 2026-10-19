# attest expert — changelog-writer (STUB)

**Cluster:** primary   **Attest source:** `agents/changelog-writer.md`

Changelog and release notes writer — reads git log range, classifies commits by type, produces CHANGELOG.md entries in Keep-a-Changelog format (Added/Changed/Fixed/Removed/Security/Deprecated). Proactive: before any v…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
