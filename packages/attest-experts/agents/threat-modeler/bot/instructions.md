# attest expert — threat-modeler (STUB)

**Cluster:** security   **Attest source:** `agents/security/threat-modeler.md`

Threat modeling specialist — STRIDE per component, DFD with trust boundaries, threat rating, and mitigation mapping. Produces THREAT_MODEL.md. Runs after semgrep-runner so it can reference confirmed findings when rati…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
