# attest expert — migration-planner (sandbox-required stub)

**Cluster:** primary   **Attest source:** `agents/migration-planner.md`

Database migration planner — compares two schema states (files or git refs), produces ordered migration steps with rollback plan per step. Proactive: before any schema change that touches existing tables.

## Why this expert needs a sandbox BDK agent

Primary mode is docs, but canonical mode emits runnable migrations into db/migrations/** — write:fs to repo source.

**Required capabilities beyond baseline:**

- `write:fs` — docs/migrations/** + db/migrations/** when asked to emit runnable DDL
- `shell:safe` — DDL validation against dialect

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
