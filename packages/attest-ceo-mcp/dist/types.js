/**
 * types.ts — the ledger / plan / task / completion shapes shared between
 * the CEO MCP server, the CEO BDK agent, and (by import) any client.
 *
 * Phase 1 keeps everything in the CEO BDK agent's `ctx.host.kv` — this
 * MCP server owns the *contract* for the JSON blobs that cross the
 * wire, not the storage.
 *
 * Keep this file dependency-free (plain types + narrow helpers) so it
 * can be re-exported from attest-ceo without pulling in the MCP SDK or
 * zod runtime.
 */
export const AUTONOMY_MODES = [
    "watch",
    "nudge",
    "draft-only",
    "draft-and-approve",
    "auto-dispatch",
];
export const DEFAULT_AUTONOMY = "draft-and-approve";
export function emptyLedger(now = new Date().toISOString()) {
    return {
        version: 1,
        roadmap: [],
        commitments: [],
        decisions: [],
        discussions: [],
        tasks: [],
        plans: [],
        autonomy: DEFAULT_AUTONOMY,
        updatedAt: now,
    };
}
export const RESOURCE_URIS = {
    roadmapCurrent: "attest://ceo/roadmap/current",
    commitmentsOpen: "attest://ceo/commitments/open",
    decisionsLog: "attest://ceo/decisions/log",
    autonomy: "attest://ceo/autonomy/current",
};
export const DEFAULT_CONDUCTOR_DISPATCH_TOOL = "run_autopilot_task";
/** CEO director feature flag (OFF by default; director worker flips it on). */
export function directorEnabled(env = process.env) {
    const raw = (env.ATTEST_DIRECTOR_ENABLED ?? "").toLowerCase();
    return raw === "1" || raw === "true" || raw === "yes";
}
//# sourceMappingURL=types.js.map