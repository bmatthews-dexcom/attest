// 00-default-deny.cedar — explicit record of the default-deny posture.
//
// Cedar semantics are already default-deny: a request with no matching
// `permit` evaluates to `deny`. This file exists so a reader of the policy
// bundle sees the posture named, versioned, and ratchet-reviewable rather
// than only implied. The `forbid` targets a sentinel expert id
// (`__none__`) that is never issued at runtime, so this policy never
// fires. Its presence is documentation + a static-analysis anchor; its
// absence would weaken nothing.
//
// If this policy ever disappears, that disappearance must be auditable.

forbid (
  principal == attest::Expert::"__none__",
  action,
  resource
);
