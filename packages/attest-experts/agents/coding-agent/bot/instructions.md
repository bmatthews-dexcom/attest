# attest expert — coding-agent (sandbox-required stub)

**Cluster:** primary   **Attest source:** `agents/coding-agent.md`

Senior implementation engineer — doc-driven coding from SDLC specs. Verifies all library APIs via Context7 before writing code. Enforces anti-slop rules: no over-engineering, no defensive bloat, no hallucinated APIs,…

## Why this expert needs a sandbox BDK agent

Implementation specialist — writes application code from spec into src/; sandbox-required for write:fs to repo source.

**Required capabilities beyond baseline:**

- `write:fs` — HANDOFF-assigned src/** per phase 4
- `shell:safe` — project build + test commands

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
