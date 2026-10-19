# attest expert — bundle-analyzer (STUB)

**Cluster:** performance   **Attest source:** `agents/performance/bundle-analyzer.md`

Frontend bundle performance specialist — bundle size, code splitting, lazy loading, tree shaking, image optimization, Core Web Vitals impact. Skip automatically for backend-only projects. Runs webpack-bundle-analyzer,…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
