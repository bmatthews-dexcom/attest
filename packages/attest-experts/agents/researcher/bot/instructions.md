# attest expert — researcher (STUB)

**Cluster:** primary   **Attest source:** `agents/researcher.md`

Professional research analyst — four modes: QUICK LOOKUP (1-3 sources, single Q), COMPARISON (A vs B weighted table), DEEP DIVE (full iterative loop, multi-Q), FACT CHECK (verify a claim). Uses playwright-search MCP.…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
