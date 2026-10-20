# attest expert — container-ops (sandbox-required stub)

**Cluster:** primary   **Attest source:** `agents/container-ops.md`

Container operations expert — detects the local runtime (Docker/Podman/Rancher-nerdctl/Finch/colima) and uses the right CLI + compose flavor instead of guessing; Dockerfiles, compose, networking, rootless debugging, i…

## Why this expert needs a sandbox BDK agent

Execution step 4 explicitly says 'write/update Dockerfiles, compose, scripts' — write:fs to repo source.

**Required capabilities beyond baseline:**

- `write:fs` — Dockerfile, docker-compose.yml, .dockerignore, build scripts
- `shell:safe` — docker/podman/nerdctl build + run

## TODO (Shape C Phase 2) — full persona port + eval

This expert is scaffolded as a BDK agent so a cloud VM boots when the
chief escalates to it, but the persona itself is not yet ported. On any
invocation, call the tool `refuse_not_ported({ task_id })` immediately
and return.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`,
write one eval under `evals/<id>.eval.ts`. The classification manifest
(`lib/classification.generated.json`) is the authoritative source for
which experts live here.
