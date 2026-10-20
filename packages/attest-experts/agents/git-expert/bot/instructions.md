# attest expert — git-expert (sandbox-required stub)

**Cluster:** primary   **Attest source:** `agents/git-expert.md`

Senior git & forge expert — repo bootstrap, feature branches, releases, history forensics, recovery, multi-remote sync. Six modes — `--init` bootstrap repo, `--feature` daily flow with atomic commits and draft PR, `--…

## Why this expert needs a sandbox BDK agent

Six modes include --init bootstrap, --feature push+PR, --release tag+push, --sync multi-remote mirror — core git:write + pr:open.

**Required capabilities beyond baseline:**

- `git:read` — reflog, blame, pickaxe, bisect
- `git:write` — commit, branch, tag, merge, rebase
- `pr:open` — draft PR via gh / tea during --feature mode
- `shell:destructive` — git push, tag push (never --force absent explicit confirm)

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
