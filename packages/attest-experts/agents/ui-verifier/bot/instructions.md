# attest expert — ui-verifier (STUB)

**Cluster:** primary   **Attest source:** `agents/ui-verifier.md`

Live browser verification specialist — navigates a running app with playwright-mcp, takes screenshots, checks accessibility snapshots, and verifies flows against use cases or UX specs. Works with any LLM (no vision re…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
