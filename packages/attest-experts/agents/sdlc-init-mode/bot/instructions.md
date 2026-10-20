# attest expert — sdlc-init-mode (STUB)

**Cluster:** primary   **Attest source:** `agents/sdlc-init-mode.md`

Mode 1 — New Project. Phases 0-5: ideation, planning, requirements, design, implementation, release. Invoked by sdlc-lead when the user runs `/sdlc init`.

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
