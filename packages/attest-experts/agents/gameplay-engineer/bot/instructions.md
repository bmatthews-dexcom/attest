# attest expert — gameplay-engineer (sandbox-required stub)

**Cluster:** game   **Attest source:** `agents/game/gameplay-engineer.md`

Gameplay engineering specialist — engine-specific implementation patterns (Godot, Unity, Phaser, Bevy, vanilla canvas): game loop vs frame budget, ECS vs inheritance, physics, input buffering, state machines, determin…

## Why this expert needs a sandbox BDK agent

WRITE-SCOPE = 'the source dirs named in the HANDOFF + docs/design/game/TECH_NOTES.md' — write:fs to repo source.

**Required capabilities beyond baseline:**

- `write:fs` — HANDOFF-named engine source dirs + docs/design/game/TECH_NOTES.md
- `shell:safe` — engine build + unit tests

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
