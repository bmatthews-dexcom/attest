# attest expert — qa-vnv-engineer (sandbox-required stub)

**Cluster:** primary   **Attest source:** `agents/qa-vnv-engineer.md`

QA & V&V (Verification and Validation) specialist — the end-user-testing discipline owner. Builds durable, automated, EVIDENCE-producing validation of the real rendered app: programmatic layout-defect detection (panel…

## Why this expert needs a sandbox BDK agent

WRITE-SCOPE explicitly includes e2e/** durable suite — write:fs to repo source.

**Required capabilities beyond baseline:**

- `write:fs` — docs/testing/vnv/** + e2e/** (durable V&V suite + playwright specs)
- `shell:safe` — playwright + axe-core + visual regression
- `net:fetch` — runs against local dev server

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
