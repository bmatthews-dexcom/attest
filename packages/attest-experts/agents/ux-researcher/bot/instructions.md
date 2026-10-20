# attest expert — ux-researcher (STUB)

**Cluster:** primary   **Attest source:** `agents/ux-researcher.md`

UX research specialist — turns personas and user stories into user-flow diagrams and a screen inventory, BEFORE any wireframe or token work starts. Runs at SDLC Phase 3.5 (Design Loop), after Phase 3 architecture and…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
