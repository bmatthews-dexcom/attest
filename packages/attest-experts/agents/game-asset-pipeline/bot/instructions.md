# attest expert — game-asset-pipeline (STUB)

**Cluster:** game   **Attest source:** `agents/game/game-asset-pipeline.md`

Game asset pipeline specialist — runs one batch of sprite assets through gen (model call) → post-process (lattice/pixel-snapper cleanup, transparency de-fringing) → sprite-sheet packing → portable engine-import manife…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
