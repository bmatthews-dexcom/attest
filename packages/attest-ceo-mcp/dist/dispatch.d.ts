/**
 * dispatch.ts — the `dispatch_plan` tool implementation.
 *
 * In Phase 1 the MCP server does NOT itself call the chief — it
 * returns a *dispatch blueprint* that the CEO agent executes via its
 * own `attest-conductor` MCP connection. Keeping the actual chief call
 * on the agent side keeps credentials + transport selection on the
 * agent (which already has `defineConnection` for `attest-conductor`)
 * and keeps this MCP server a pure contracts-and-schemas boundary.
 *
 * The blueprint carries everything the agent needs to issue the N
 * chief tasks:
 *   - which conductor tool to call (`run_autopilot_task` by default,
 *     overridable per-plan if the chief ever renames it);
 *   - the per-step inputs;
 *   - the dispatch mode (concurrent vs sequenced);
 *   - a hint about which autonomy to apply (watch/nudge/draft-only
 *     surfaces as "do nothing"; draft-and-approve requires the
 *     plan.approvalState === "approved"; auto-dispatch skips approval
 *     for low-risk plans — the CEO evaluator decides risk).
 *
 * ----
 *
 * TODO(ceo): switch to the real attest-mcp task-status resource when
 *            the sibling Shape C attest-mcp worker lands
 *            `attest://tasks/<id>/status.json`. Today, the CEO uses a
 *            mocked read (see `mockTaskStatus`) because the resource
 *            is still in flight. See
 *            `/cursor/stores/.../internal/attest-ceo-build.md` for the
 *            coordination note.
 */
import { type AutonomyMode, type ChiefTaskStatus, type Plan } from "./types.js";
export type DispatchBlueprint = {
    planId: string;
    mode: "concurrent" | "sequenced";
    conductorTool: string;
    autonomy: AutonomyMode;
    calls: DispatchCall[];
    skipped: SkippedReason[];
};
export type DispatchCall = {
    stepId: string;
    description: string;
    input: {
        goal: string;
        iterationCap?: number;
        wallTimeCapMs?: number;
        maxTurns?: number;
    };
    scope: string;
    phaseHint?: string | null;
};
export type SkippedReason = {
    kind: "non-approved";
    approvalState: Plan["approvalState"];
} | {
    kind: "autonomy-blocks";
    autonomy: AutonomyMode;
} | {
    kind: "docs-only-step";
    stepId: string;
} | {
    kind: "already-dispatched";
    stepId: string;
    chiefTaskId: string;
};
export type DispatchInput = {
    plan: Plan;
    autonomyMode: AutonomyMode;
    conductorTool?: string;
};
export declare function buildDispatchBlueprint(input: DispatchInput): DispatchBlueprint;
/**
 * Phase-1 mock for `attest://tasks/<id>/status.json`. Replace once the
 * sibling attest-mcp Shape C resource lands.
 */
export declare function mockTaskStatus(taskId: string): ChiefTaskStatus;
//# sourceMappingURL=dispatch.d.ts.map