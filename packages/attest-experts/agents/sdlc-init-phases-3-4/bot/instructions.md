# attest expert — sdlc-init-phases-3-4 (STUB)

**Cluster:** primary   **Attest source:** `agents/sdlc-init-phases-3-4.md`

SUPERSEDED — do not load. Split into sdlc-init-phase-3.md (Phases 3+3.5) and sdlc-init-phase-4.md (Phases 4+5). sdlc-init-mode.md already references the split files. Retained for doc references only.

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
