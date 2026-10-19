# attest expert — owasp-llm-checker (STUB)

**Cluster:** security   **Attest source:** `agents/security/owasp-llm-checker.md`

OWASP LLM Top 10 specialist (2025) — checks LLM01–LLM10 for projects using AI/LLM APIs. Only runs when LLM code is detected. Covers prompt injection, output handling, excessive agency, supply chain, unbounded consumpt…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
