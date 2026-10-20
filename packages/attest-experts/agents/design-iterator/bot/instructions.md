# attest expert — design-iterator (STUB)

**Cluster:** primary   **Attest source:** `agents/design-iterator.md`

Visual design iteration specialist — the closed render→screenshot→critique→fix→re-verify loop that makes a running UI match its design system (Claude-Design-style: code and pixels in one feedback cycle). Grounds every…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
