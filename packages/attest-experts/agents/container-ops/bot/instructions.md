# attest expert — container-ops (STUB)

**Cluster:** primary   **Attest source:** `agents/container-ops.md`

Container operations expert — detects the local runtime (Docker/Podman/Rancher-nerdctl/Finch/colima) and uses the right CLI + compose flavor instead of guessing; Dockerfiles, compose, networking, rootless debugging, i…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
