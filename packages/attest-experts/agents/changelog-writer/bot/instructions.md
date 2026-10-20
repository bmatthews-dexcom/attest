# attest expert — changelog-writer (sandbox-required stub)

**Cluster:** primary   **Attest source:** `agents/changelog-writer.md`

Changelog and release notes writer — reads git log range, classifies commits by type, produces CHANGELOG.md entries in Keep-a-Changelog format (Added/Changed/Fixed/Removed/Security/Deprecated). Proactive: before any v…

## Why this expert needs a sandbox BDK agent

Writes CHANGELOG.md directly at repo root (not under docs/) in Keep-a-Changelog format — write:fs to a checked-in source file.

**Required capabilities beyond baseline:**

- `write:fs` — CHANGELOG.md (top-level repo file)
- `git:read` — git log <last-tag>..HEAD for commit range

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
