// 20-security-auditor-read-only.cedar — security-auditor's full fence set.
//
// Named after the reference BDK agent in attest-experts PR #4. The expert
// reads source, runs semgrep (which the engine classifies as `shell:safe`
// — semgrep never mutates), and never writes. This policy makes the
// enforcement explicit so a future change to the handler can't quietly
// widen the fence.

permit (
  principal == attest::Expert::"security-auditor",
  action == attest::Action::"Invoke",
  resource
)
when {
  resource.kind == "read:fs" ||
  resource.kind == "git:read" ||
  resource.kind == "shell:safe"
};
