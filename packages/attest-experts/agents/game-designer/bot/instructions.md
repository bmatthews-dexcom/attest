# attest expert — game-designer (STUB)

**Cluster:** game   **Attest source:** `agents/game/game-designer.md`

Game design specialist — core loop, mechanics, systems, and the Game Design Document (GDD, the game-project equivalent of the SRS). Use at the start of any game project or when a mechanic needs design. Owns WHAT the g…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
