# attest expert — game-audio-designer (sandbox-required stub)

**Cluster:** game   **Attest source:** `agents/game/game-audio-designer.md`

Game audio specialist — sonic direction, SFX/music/VO planning, middleware architecture (FMOD/Wwise vs engine-native), event naming, mix rules, memory/voice budgets, and agent-generated placeholder audio (ElevenLabs M…

## Why this expert needs a sandbox BDK agent

WRITE-SCOPE extends into HANDOFF-named audio asset/event dirs (engine source) — write:fs to repo source.

**Required capabilities beyond baseline:**

- `write:fs` — docs/design/game/AUDIO.md + HANDOFF-named audio asset/event source dirs
- `net:fetch` — ElevenLabs / audio-gen APIs for placeholders

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
