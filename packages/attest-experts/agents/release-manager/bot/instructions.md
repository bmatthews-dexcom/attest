# attest expert — release-manager (sandbox-required stub)

**Cluster:** primary   **Attest source:** `agents/release-manager.md`

Release manager — thin coordinator for shipping a release: version bump, changelog assembly, tag, deploy-gate checklist, both-remotes push. Sequences git-expert, changelog-writer, and the validators; owns the release…

## Why this expert needs a sandbox BDK agent

Chief-architecture doc Section 4 names release-manager as the sole holder of shell:destructive at phase 5 — version bump touches package.json even if it delegates publish steps.

**Required capabilities beyond baseline:**

- `write:fs` — docs/work/release/** (checklist) + version-bump files (package.json, etc.)
- `shell:destructive` — registry publish, git push, gh pr merge during phase 5 only
- `git:write` — tag + push during release cut
- `publish:npm` — registry upload during release cut

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
