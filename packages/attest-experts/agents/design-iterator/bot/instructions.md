# attest expert — design-iterator (sandbox-required stub)

**Cluster:** primary   **Attest source:** `agents/design-iterator.md`

Visual design iteration specialist — the closed render→screenshot→critique→fix→re-verify loop that makes a running UI match its design system (Claude-Design-style: code and pixels in one feedback cycle). Grounds every…

## Why this expert needs a sandbox BDK agent

Closed render→screenshot→critique→fix loop; HANDOFF WRITE-SCOPE must name source dirs it mutates — write:fs to repo source.

**Required capabilities beyond baseline:**

- `write:fs` — HANDOFF-assigned source dirs the render→critique→fix loop iterates on
- `shell:safe` — playwright screenshot capture + build
- `net:fetch` — model APIs for visual critique

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
