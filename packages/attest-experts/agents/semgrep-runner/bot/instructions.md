# attest expert — semgrep-runner (STUB)

**Cluster:** security   **Attest source:** `agents/security/semgrep-runner.md`

SAST specialist — runs semgrep with all registered rule packs (community + custom), triages findings REAL/FP/UNVERIFIED, writes structured finding output. Phase 1 of any security scan. Always runs; other specialists b…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
