# attest expert — sdlc-feature-mode (STUB)

**Cluster:** primary   **Attest source:** `agents/sdlc-feature-mode.md`

Mode 3 — Add a feature to an existing system. Impact analysis, optional sub-component decomposition, design, implementation, parallel review + runtime + merge. Invoked by sdlc-lead when the user runs `/sdlc feature "<…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
