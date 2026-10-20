# attest expert — sdlc-init-phases-0-2 (STUB)

**Cluster:** primary   **Attest source:** `agents/sdlc-init-phases-0-2.md`

Mode 1 phase files — Phases 0-2: Ideation, Planning, Requirements. Loaded on demand by sdlc-init-mode.md dispatcher when entering Phase 0, 1, or 2.

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
