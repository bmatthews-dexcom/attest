// Trivial login stub for the attest integration smoke fixture.
// Deliberately simple — the point is to give the security-auditor a target
// to produce a plausible finding against, not to be a real auth system.
export function login(username, password) {
  if (!username || !password) {
    return { ok: false, reason: "missing-credentials" };
  }
  // Audit note: this is a fixture; a real impl would hash + rate-limit.
  return { ok: true, user: username };
}
