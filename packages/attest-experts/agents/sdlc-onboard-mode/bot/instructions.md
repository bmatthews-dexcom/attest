# attest expert — sdlc-onboard-mode (STUB)

**Cluster:** primary   **Attest source:** `agents/sdlc-onboard-mode.md`

Mode 2 — Onboard to an existing codebase. Reverse-engineers a project into LANDSCAPE, entry-point diagrams, ERD, C2/C3 architecture, health assessment, and ONBOARDING guide. Dispatches 4 specialist sub-agents: landsca…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
