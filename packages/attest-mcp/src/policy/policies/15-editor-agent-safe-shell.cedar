// 15-editor-agent-safe-shell.cedar — hook-path permit for the editor
// chief.
//
// The Cursor beforeShellExecution / preToolUse hooks run through
// `attest-mcp-policy evaluate --kind=<shell|write>` with the principal
// defaulted to `editor-agent` (see src/policy/hooks.ts). This policy
// permits the safe-shell capability (`shell:safe`) for that principal
// so day-to-day operations (ls, git log, npm test, cargo check, …) are
// NOT denied by the default-deny sentinel. The 40-destructive-shell-
// forbidden policy still wins for anything the hook classifies as
// `shell:destructive`.
//
// Write mutations continue to require explicit per-handler permits
// (secrets-scanner, dependency-auditor, semgrep-runner cover their own
// read-only + net:fetch surface); the editor-agent principal falls into
// the 30-code-mutator-requires-approval requireApproval branch for
// `write:fs` and into the forbid for `env:write`.

permit (
  principal == attest::Expert::"editor-agent",
  action == attest::Action::"Invoke",
  resource
)
when {
  resource.kind == "shell:safe"
};
