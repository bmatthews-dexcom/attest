// 50-publish-npm-requires-approval.cedar — release-shaped work is HITL-gated.
//
// `npm publish` is cited explicitly in the design doc §4 as a shell:destructive
// op that even the release-manager expert may only perform via gate +
// elicitation. We model that at the policy layer by permitting `Approve`
// (which routes to the HITL path) but never permitting `Invoke`.

permit (
  principal,
  action == attest::Action::"Approve",
  resource
)
when {
  resource.kind == "publish:npm"
};
