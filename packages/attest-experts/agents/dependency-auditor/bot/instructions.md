# attest expert — dependency-auditor (STUB)

**Cluster:** security   **Attest source:** `agents/security/dependency-auditor.md`

Dependency and supply chain security specialist — CVE scans, SBOM/SCA correlation (syft + grype, CISA KEV), outdated packages, license risk, and slopsquatting detection (AI-hallucinated package names registered by att…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
