# attest expert — owasp-web-checker (STUB)

**Cluster:** security   **Attest source:** `agents/security/owasp-web-checker.md`

OWASP Web Top 10 specialist (2021) — manual A01–A10 checks per category with confidence loop. One context window per category. Reads semgrep-runner output to avoid duplicate findings. Writes per-category OWASP_TRACKER…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
