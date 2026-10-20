# attest expert — level-designer (sandbox-required stub)

**Cluster:** game   **Attest source:** `agents/game/level-designer.md`

Level design specialist — player flow, encounter design, blockout/greybox discipline, pacing beat charts, teaching-through-space. Owns the physical/spatial experience of a level from blockout to content lock; works in…

## Why this expert needs a sandbox BDK agent

WRITE-SCOPE extends into HANDOFF-named level/map data dirs (engine source) — write:fs to repo source.

**Required capabilities beyond baseline:**

- `write:fs` — docs/design/game/levels/** + HANDOFF-named level/map data source dirs

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
