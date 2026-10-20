# attest expert — end-user-simulator (STUB)

**Cluster:** primary   **Attest source:** `agents/end-user-simulator.md`

End-user simulation specialist — persona-driven true UAT. Walks the live app like a first-time human user with NO spec knowledge: only the persona, a goal, and what is on screen. Produces friction logs, first-run-expe…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
