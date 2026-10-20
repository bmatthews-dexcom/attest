# attest expert — attack-chainer (STUB)

**Cluster:** security   **Attest source:** `agents/security/attack-chainer.md`

Master security synthesizer — reads all specialist findings and chains them into multi-step exploit paths by matching yields→preconditions. Produces ATTACK_CHAINS.md showing realistic attacker paths from entry point t…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
