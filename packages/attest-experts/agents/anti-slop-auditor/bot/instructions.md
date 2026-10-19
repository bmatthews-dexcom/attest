# attest expert — anti-slop-auditor (STUB)

**Cluster:** code-review   **Attest source:** `agents/code-review/anti-slop-auditor.md`

AI slop detection specialist — checks all 31 ANTI_SLOP_RULES (R-01 to R-31) including 2025-2026 additions: slopsquatting (hallucinated packages), architectural privilege escalation (+322% in AI codebases), credential…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
