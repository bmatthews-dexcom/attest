# attest expert — ux-engineer (STUB)

**Cluster:** primary   **Attest source:** `agents/ux-engineer.md`

Senior UX engineer — design direction, user workflows, component architecture, WCAG 2.2 accessibility, live-environment design review. Use when designing new interfaces (--design), reviewing PR UI changes (--review),…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
