# attest expert — a11y-compliance (STUB)

**Cluster:** primary   **Attest source:** `agents/a11y-compliance.md`

Accessibility & compliance auditor — WCAG 2.2 AA/AAA conformance, ATAG, EN 301 549 / European Accessibility Act, Section 508; axe-core/Lighthouse/pa11y tooling; remediation with file:line. Use after UX design (audit t…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
