# attest expert — secrets-scanner (STUB)

**Cluster:** security   **Attest source:** `agents/security/secrets-scanner.md`

Secrets and credentials specialist — finds hardcoded API keys, tokens, passwords, and private keys in source code, configs, and git history. Uses TruffleHog, grep patterns, and git log. Runs in parallel with semgrep-r…

## TODO Phase 2: full persona port + eval

This expert is not yet ported to the attest-experts BDK pack. The id and dispatch
surface exist so the conductor can bind to it. On any invocation, call the tool
`refuse_not_ported({ task_id })` immediately and return — do not attempt the task.

Porting path: copy an existing concrete expert (e.g. `agents/security-auditor/`),
swap the registry row and the persona-section of `instructions.md`, write one
eval under `evals/<id>.eval.ts`.
