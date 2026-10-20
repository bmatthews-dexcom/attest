# attest expert — component-mapper (STUB)

**Cluster:** onboarding   **Attest source:** `agents/sdlc/onboard/component-mapper.md`

Onboard specialist — Step 4. Maps internal modules and deployment topology. Produces c2-containers.md (C2 Container: all services + external systems) and c3-components.md (C3 Component: internal module dependencies).…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
