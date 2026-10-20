# attest expert — game-balance-designer (sandbox-required stub)

**Cluster:** game   **Attest source:** `agents/game/game-balance-designer.md`

Game balance and economy specialist — progression curves, economy sinks/sources, difficulty tuning, drop tables. Outputs spreadsheet-style models with formulas and SIMULATES them (1000 player-sessions as a script) bef…

## Why this expert needs a sandbox BDK agent

WRITE-SCOPE explicitly includes 'the game's tunable config files' alongside docs/design/game/balance/ — write:fs to repo source.

**Required capabilities beyond baseline:**

- `write:fs` — docs/design/game/balance/** + the game's tunable config files
- `shell:safe` — simulate 1000 player-sessions as a script

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
