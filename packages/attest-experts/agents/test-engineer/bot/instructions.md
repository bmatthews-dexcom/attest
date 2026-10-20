# attest expert — test-engineer (sandbox-required stub)

**Cluster:** primary   **Attest source:** `agents/test-engineer.md`

Senior test engineer — Playwright e2e, vitest/jest unit tests, integration tests, test strategy, coverage analysis. Use when writing tests or designing test strategy. Proactive: after implementing any feature, or when…

## Why this expert needs a sandbox BDK agent

Senior test engineer — generates and runs real test files into tests/** and e2e/**; write:fs to repo source.

**Required capabilities beyond baseline:**

- `write:fs` — tests/**, __tests__/**, e2e/**, and HANDOFF-assigned module tests
- `shell:safe` — test runners (vitest/jest/playwright)

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
