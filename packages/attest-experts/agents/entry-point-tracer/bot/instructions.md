# attest expert — entry-point-tracer (STUB)

**Cluster:** onboarding   **Attest source:** `agents/sdlc/onboard/entry-point-tracer.md`

Onboard specialist — Steps 2+2b. Traces all HTTP routes, CLI commands, event listeners, webhooks. Produces entry-points.md (sequenceDiagram per entry point with error path) and sequences/ directory (auth, primary writ…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
