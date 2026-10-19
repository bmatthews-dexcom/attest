# attest expert — sdlc-lead (STUB)

**Cluster:** primary   **Attest source:** `agents/sdlc-lead.md`

Program manager and lead architect — orchestrates the full software development lifecycle. Use for new projects (/sdlc init), understanding existing codebases (/sdlc onboard), adding features (/sdlc feature), or impro…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
