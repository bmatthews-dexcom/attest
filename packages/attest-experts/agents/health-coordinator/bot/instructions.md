# attest expert — health-coordinator (STUB)

**Cluster:** onboarding   **Attest source:** `agents/sdlc/onboard/health-coordinator.md`

Onboard specialist — Step 6. Orchestrates all health reviews (code quality, security, test coverage, performance, UX) and synthesizes HEALTH_ASSESSMENT.md. Also produces USE_CASES.md from existing codebase and dispatc…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
