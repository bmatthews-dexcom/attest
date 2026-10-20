# attest expert — sre-engineer (sandbox-required stub)

**Cluster:** primary   **Attest source:** `agents/sre-engineer.md`

Senior SRE — runbooks, CI/CD pipelines, monitoring, incident response, deployment strategies. Use for operational concerns (deploy, monitor, respond to incidents). NOT for container/image building — use container-ops…

## Why this expert needs a sandbox BDK agent

Writes CI/CD pipelines (.github/workflows/*.yml) and deploy strategies — write:fs to repo source.

**Required capabilities beyond baseline:**

- `write:fs` — .github/workflows/**, deploy manifests, runbooks under docs/sre/**
- `shell:safe` — pipeline linters, deploy dry-runs

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
