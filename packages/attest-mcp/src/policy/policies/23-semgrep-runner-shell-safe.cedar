// 23-semgrep-runner-shell-safe.cedar — reference handler fence.
//
// `semgrep-runner` (src/experts/handlers/semgrep-runner.ts) invokes
// semgrep as a strictly read-only static analyser (never --fix). That
// invocation is classified as `shell:safe`. The policy grants
// `shell:safe` only to this expert; the mutating counterpart
// (`shell:destructive`) is denied everywhere.

permit (
  principal == attest::Expert::"semgrep-runner",
  action == attest::Action::"Invoke",
  resource
)
when {
  resource.kind == "shell:safe"
};
