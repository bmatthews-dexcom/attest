# attest expert — sdlc-improve-mode (STUB)

**Cluster:** primary   **Attest source:** `agents/sdlc-improve-mode.md`

Mode 4 — Audit and improve an existing system. Discovery audit, multi-specialist audit fan-out, synthesis into improvement backlog, scoped fix execution. Invoked by sdlc-lead when the user runs `/sdlc improve ["<focus…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
