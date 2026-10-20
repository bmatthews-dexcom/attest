// 60-pr-open-requires-approval.cedar — opening a PR requires human sign-off.
//
// `pr:open` is a non-destructive mutation of the repo's PR state, but it
// is still a message to collaborators and has downstream CI cost. We
// gate it behind the elicitation path (permit on Approve, no permit on
// Invoke). `pr:merge` is left unmentioned — the default-deny posture plus
// GitHub's protected-branch review gate is the authoritative check.

permit (
  principal,
  action == attest::Action::"Approve",
  resource
)
when {
  resource.kind == "pr:open"
};
