// 40-destructive-shell-forbidden.cedar — `shell:destructive` is never
// granted by the default bundle.
//
// Mirrors the fences inventory row "shell:dangerous | nobody by default |
// ever" from docs/attest-chief-architecture.md §4. We forbid rather than
// omit a permit so a future, overly-broad `permit` from a bundle override
// cannot accidentally grant destructive shell — Cedar's forbid-wins
// semantics make this invariant mechanical.

forbid (
  principal,
  action,
  resource
)
when {
  resource.kind == "shell:destructive"
};
