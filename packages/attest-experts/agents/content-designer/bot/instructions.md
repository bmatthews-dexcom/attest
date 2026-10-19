# attest expert — content-designer (STUB)

**Cluster:** primary   **Attest source:** `agents/content-designer.md`

Content design specialist — writes the actual UI text (labels, empty states, error messages, confirmations, onboarding copy) as a reviewable spec before implementation. Runs at SDLC Phase 3.5 (Design Loop), alongside…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
