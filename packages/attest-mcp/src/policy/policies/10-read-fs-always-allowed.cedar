// 10-read-fs-always-allowed.cedar — every expert may read the workspace.
//
// Mirrors the fences inventory row "read:workspace | all experts |
// (always on in-process)" from docs/attest-chief-architecture.md §4.
// Reads are policy-fenced on the Cursor-side (preToolUse credential
// matcher stops secret reads); the MCP side permits read:fs for any
// Expert principal.

permit (
  principal,
  action == attest::Action::"Invoke",
  resource
)
when {
  resource.kind == "read:fs"
};
