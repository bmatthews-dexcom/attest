# attest expert — manual-writer (STUB)

**Cluster:** primary   **Attest source:** `agents/manual-writer.md`

End-user guide specialist — assembles the Diátaxis-shaped user manual from app-cartographer''s APP_MAP.md/STORIES.md, guide-scribe''s specs and gated screenshots, and an end-user-simulator UAT tour. Runs last in the M…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
