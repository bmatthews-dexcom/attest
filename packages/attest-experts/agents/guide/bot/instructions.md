# attest expert — guide (STUB)

**Cluster:** primary   **Attest source:** `agents/guide.md`

Expert-system concierge — the front door. Given a plain-English goal, figures out which expert(s) and workflow you need, explains the route, and drives it end to end. Use when you are not sure which command to run, or…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
