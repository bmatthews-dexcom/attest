// 11-git-read-always-allowed.cedar — any expert may run read-only git.
//
// `git log`, `git diff`, `git show`, `git rev-parse` and friends never
// mutate repo state. We permit them universally; the mutating counterparts
// (`git:write`, `pr:open`, `pr:merge`) are not permitted anywhere in the
// default bundle and require sandboxed BDK dispatch + explicit approval.

permit (
  principal,
  action == attest::Action::"Invoke",
  resource
)
when {
  resource.kind == "git:read"
};
