// 22-dependency-auditor-net-fetch.cedar — reference handler fence.
//
// `dependency-auditor` (src/experts/handlers/dependency-auditor.ts) reads
// package manifests and consults the OSV / CISA KEV vulnerability
// databases. It needs `read:fs` (already granted by policy 10) and
// `net:fetch` — this policy grants the latter only to this expert id,
// so an unrelated handler cannot silently gain outbound network access.

permit (
  principal == attest::Expert::"dependency-auditor",
  action == attest::Action::"Invoke",
  resource
)
when {
  resource.kind == "net:fetch"
};
