# attest expert — narrative-designer (sandbox-required stub)

**Cluster:** game   **Attest source:** `agents/game/narrative-designer.md`

Narrative design specialist — integrates story into SYSTEMS: branching structure, quest/mission logic, barks, environmental storytelling, dialogue data formats. Narrative designer ≠ writer: this agent designs how stor…

## Why this expert needs a sandbox BDK agent

WRITE-SCOPE extends into HANDOFF-named dialogue/quest data dirs (engine source) — write:fs to repo source.

**Required capabilities beyond baseline:**

- `write:fs` — docs/design/game/NARRATIVE.md + HANDOFF-named dialogue/quest data source dirs

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
