# attest expert — playtest-evaluator (STUB)

**Cluster:** game   **Attest source:** `agents/game/playtest-evaluator.md`

Playtest specialist — plays the vertical slice via browser/input automation and evaluates against fun heuristics: clarity of goal, feedback juice, difficulty ramp, time-to-first-success. The game equivalent of end-use…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
