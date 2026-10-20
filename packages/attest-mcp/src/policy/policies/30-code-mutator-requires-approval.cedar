// 30-code-mutator-requires-approval.cedar — write:fs is HITL-gated.
//
// This policy permits the `Approve` action for `write:fs` capability. The
// engine's two-pass evaluation (see src/policy/engine.ts) treats a request
// where `Invoke` denies but `Approve` permits as `requireApproval`, which
// routes to the HITL elicitation gate.
//
// No `permit` for `Invoke` on `write:fs` ships in the default bundle: any
// expert that wants to write source first has to pass human approval.
// Shape-C's intent is that this HITL check is the authoritative place
// where the human says yes to a write; sandboxed BDK experts earn their
// `write:fs` by being granted this approval, not by being deployed to
// their own VM.

permit (
  principal,
  action == attest::Action::"Approve",
  resource
)
when {
  resource.kind == "write:fs"
};
