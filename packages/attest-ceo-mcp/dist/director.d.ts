/**
 * director.ts — stub for the Director's `create_expert` MCP tool.
 *
 * The Director agent is still in design (see
 * `/cursor/stores/.../notes.md` → "Director design — in flight").
 * Until it deploys, the CEO must still have *some* answer when it
 * decides to request a new expert, so the tool exists but short-
 * circuits to a structured "director not deployed" response.
 *
 * The feature flag `ATTEST_DIRECTOR_ENABLED` is read on every call so
 * flipping it in a hosted deploy (via env var) is live without a
 * restart; the Director worker will set it to `true` when the real
 * tool wire is ready, and this stub becomes the proxy at that point.
 *
 * Keep the tool name + input shape stable. If the Director worker
 * renames the tool, align here (see sibling-contract notes in the PR
 * body).
 */
export type DirectorCreateExpertInput = {
    role: string;
    example_task: string;
    inputs: string[];
    outputs: string[];
    urgency: "low" | "medium" | "high";
};
export type DirectorCreateExpertResult = {
    ok: boolean;
    status: "stubbed" | "created" | "queued";
    message: string;
    request: DirectorCreateExpertInput;
};
/**
 * The stub always returns `status: "stubbed"` + a clear "not deployed"
 * message when the flag is off. When the flag is on it still returns
 * `stubbed` for Phase 1 because this package deliberately does NOT
 * contain a real Director client — the Director worker will replace
 * this function (or ship its own MCP server that the CEO connects to
 * directly). Logging an explicit "flag was on but no transport is
 * wired" surface helps that worker land cleanly.
 */
export declare function stubCreateExpert(input: DirectorCreateExpertInput, env?: NodeJS.ProcessEnv): DirectorCreateExpertResult;
//# sourceMappingURL=director.d.ts.map