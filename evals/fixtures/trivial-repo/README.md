# trivial-repo — integration smoke fixture

This directory is a deliberately tiny fixture repo that the cross-package
integration smoke (`scripts/integration-smoke.mjs`) and the integration
eval (`packages/attest-conductor/evals/integration/attest-e2e.eval.ts`)
drive the attest stack against end-to-end.

It is NOT a real project — just enough signal (a trivial source file, a
README, a package.json) for the conductor to hand to the security-auditor
expert and for `phase_gate_check` to return a plausible `plannedValidators`
list. The security-auditor's structured report, the conductor's
`phase_gate_check` call, and the `advance_phase` + `mark_done` moves are
what the smoke / eval assert on — not the fixture's own correctness.

Updating the fixture:

- Keep the surface tiny. The point is to prove the plumbing, not to flex
  attest's actual validators.
- No secrets, no destructive files, no live network calls.
- The fixture is read in-process by the smoke; nothing writes to it.
