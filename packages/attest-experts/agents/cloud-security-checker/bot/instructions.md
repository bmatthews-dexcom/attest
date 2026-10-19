# attest expert — cloud-security-checker (STUB)

**Cluster:** security   **Attest source:** `agents/security/cloud-security-checker.md`

Cloud security specialist — AWS and GCP security anti-patterns in source code and SDK usage. Checks hardcoded keys, overly permissive IAM, open security groups, missing audit logs, public storage, and GCP-specific pat…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
