// 41-env-write-forbidden.cedar — defence-in-depth: credential-file
// writes are forbidden across every principal.
//
// `env:write` is the capability `src/policy/hooks.ts` assigns when a
// write-hook target matches one of the credential path patterns
// (`.env`, `credentials.json`, `secrets.json`, `*.key|*.pem|*.p12|
// *.pfx`, SSH private keys). Independent of the editor-agent /
// in-process-handler principal, writes to those paths are always
// denied: no principal in Shape C has a legitimate reason to touch
// those files, and the sibling cursor-build-target hook
// `block-credentials.sh` already blocks them with a separate rule
// (Shape-C ADR 0012 — defence in depth).
//
// A `forbid` in Cedar beats every `permit`, so this policy is the
// authoritative chokepoint even if a future permit tries to widen
// `env:write`.

forbid (
  principal,
  action == attest::Action::"Invoke",
  resource
)
when {
  resource.kind == "env:write"
};
