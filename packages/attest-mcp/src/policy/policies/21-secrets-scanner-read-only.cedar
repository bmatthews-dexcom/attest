// 21-secrets-scanner-read-only.cedar — reference handler fence.
//
// `secrets-scanner` is one of the three reference in-process handlers
// shipped with this PR (src/experts/handlers/secrets-scanner.ts). It
// walks the workspace matching known secret patterns, writes nothing,
// runs no shell. The policy pins it to `read:fs` and nothing else — a
// future change that tries to add shell execution would be denied
// until this policy is updated.

permit (
  principal == attest::Expert::"secrets-scanner",
  action == attest::Action::"Invoke",
  resource
)
when {
  resource.kind == "read:fs"
};
