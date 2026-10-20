# attest expert — reliability-engineer (sandbox-required stub)

**Cluster:** primary   **Attest source:** `agents/reliability-engineer.md`

Reliability engineer — load testing & resilience specialist: what breaks under stress and what happens then. Load-test strategy (k6/Locust/vegeta), chaos scenarios, circuit breakers, bulkheads, retries with backoff+ji…

## Why this expert needs a sandbox BDK agent

`--loadtest` mode writes runnable scripts into tests/load/** — write:fs to repo source.

**Required capabilities beyond baseline:**

- `write:fs` — docs/** + tests/load/** (k6/Locust/vegeta scripts)
- `shell:safe` — load-test runners

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
