# attest expert — sre-engineer (STUB)

**Cluster:** primary   **Attest source:** `agents/sre-engineer.md`

Senior SRE — runbooks, CI/CD pipelines, monitoring, incident response, deployment strategies. Use for operational concerns (deploy, monitor, respond to incidents). NOT for container/image building — use container-ops…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
