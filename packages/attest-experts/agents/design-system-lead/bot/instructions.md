# attest expert — design-system-lead (STUB)

**Cluster:** primary   **Attest source:** `agents/design-system-lead.md`

Design system specialist — produces the pre-code token spec (docs/design/tokens.json) and component inventory (docs/design/components.md) that high-fi mockups and implementation both build from. Runs at SDLC Phase 3.5…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
