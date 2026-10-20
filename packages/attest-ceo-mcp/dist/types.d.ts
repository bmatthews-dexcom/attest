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
/** CEO autonomy mode (independent of chief autonomy). Default: draft-and-approve. */
export type AutonomyMode = "watch" | "nudge" | "draft-only" | "draft-and-approve" | "auto-dispatch";
export declare const AUTONOMY_MODES: readonly AutonomyMode[];
export declare const DEFAULT_AUTONOMY: AutonomyMode;
/**
 * `source` on a discussion / commitment. In Phase 1 the only live
 * channels are `cursor-chat` (CEO is in the conversation) and `paste`
 * (user drops a Slack / Linear / GitHub / notes blob into chat). The
 * other kinds are reserved for Phase 2 so callers that already know
 * what shape they're forwarding don't need a schema change later.
 */
export type DiscussionSource = {
    channel: "cursor-chat" | "paste" | "slack" | "linear" | "github" | "notes" | "email" | "other";
    hint?: string;
    url?: string | null;
    referenceTime?: string | null;
};
export type IntentKind = "new-feature" | "bug" | "finding" | "decision" | "question" | "chore";
export type Intent = {
    id: string;
    summary: string;
    kind: IntentKind;
    confidence: number;
    sourceEpisode: string;
    proposedCommitmentText: string;
    fingerprint: string;
};
export type CommitmentState = "open" | "in-flight" | "shipped" | "cancelled" | "superseded";
export type Commitment = {
    id: string;
    text: string;
    state: CommitmentState;
    source: DiscussionSource;
    evidence: string[];
    dedupeFingerprint: string;
    createdAt: string;
    updatedAt: string;
    dependencyIds: string[];
    chiefTaskIds: string[];
    priorityBand?: "p0" | "p1" | "p2" | "p3";
};
export type Initiative = {
    id: string;
    title: string;
    rationale: string;
    commitmentIds: string[];
    state: "planned" | "in-flight" | "done" | "cancelled";
    priorityBand: "p0" | "p1" | "p2" | "p3";
    createdAt: string;
    updatedAt: string;
};
export type PlanStep = {
    id: string;
    description: string;
    /** `null` means a docs-only / coordination step with no chief dispatch. */
    dispatch: PlanDispatch | null;
    /** `done` once a chief task reports completion back to the CEO. */
    state: "pending" | "in-flight" | "done" | "failed" | "cancelled";
    chiefTaskId?: string | null;
};
export type PlanDispatch = {
    /** Repo scope the chief operates on (e.g. "attest-experts/experts/landscape-mapper/"). */
    scope: string;
    phaseHint?: string | null;
    autonomy?: "interactive" | "auto";
};
export type PlanApprovalState = "draft" | "awaiting-approval" | "approved" | "denied" | "in-flight" | "complete" | "cancelled";
export type Plan = {
    id: string;
    version: number;
    title: string;
    rationale: string;
    commitmentIds: string[];
    steps: PlanStep[];
    approvalState: PlanApprovalState;
    estimatedChiefSessions: number;
    riskNotes: string;
    createdAt: string;
    updatedAt: string;
    /**
     * Explicit dispatch mode when CEO issues the chief tasks:
     *  - "concurrent" fires each step's chief task in parallel;
     *  - "sequenced" waits for each step's chief task to complete
     *    before firing the next.
     * Defaults to "sequenced" (safer; matches design doc §4.1).
     */
    dispatchMode?: "concurrent" | "sequenced";
};
export type Decision = {
    id: string;
    what: string;
    when: string;
    inputs: Record<string, unknown>;
    rationale: string;
    /** Short free-text policy evaluation note; Cedar wiring lands later. */
    policyEvaluation?: string | null;
    confidence?: number | null;
};
export type DiscussionDigest = {
    id: string;
    source: DiscussionSource;
    ingestedAt: string;
    textPreview: string;
    intentIds: string[];
};
/**
 * Reference to a chief task the CEO dispatched (or that got attached
 * to the CEO via reconciliation). The actual chief state lives in
 * `attest-mcp` resources; this record is just the handle the CEO
 * keeps for resumption on completion notifications.
 */
export type TaskRef = {
    chiefTaskId: string;
    planId: string;
    stepId: string;
    dispatchedAt: string;
    lastSeenStatus?: ChiefTaskStatus["status"] | null;
    completedAt?: string | null;
};
/**
 * Shape of `attest://tasks/<task_id>/status.json`.
 *
 * The attest-mcp Shape C worker is still landing this resource; keep
 * the shape here as the shared contract so the CEO can mock it when the
 * resource is not yet available upstream. See TODO(ceo) in dispatch.ts.
 */
export type ChiefTaskStatus = {
    taskId: string;
    status: "running" | "halted" | "done" | "escalated";
    currentPhase?: string;
    iteration?: number;
    iterationCap?: number;
    openFindings?: number;
    lastSummary?: string;
    updatedAt?: string;
};
/**
 * Shape of `attest://tasks/<task_id>/completion.json`.
 *
 * Written once by the chief when a task closes. Reconciliation reads
 * this on each CEO turn and resolves / updates commitments.
 */
export type ChiefTaskCompletion = {
    taskId: string;
    status: "done" | "escalated" | "cancelled";
    endReason: string;
    closedAt: string;
    evidence: Array<{
        kind: "file" | "pr" | "finding" | "receipt";
        path?: string;
        url?: string;
        summary?: string;
    }>;
    openFindings: Array<{
        severity: "soft" | "gate" | "halt";
        message: string;
    }>;
};
export type CeoLedger = {
    version: 1;
    roadmap: Initiative[];
    commitments: Commitment[];
    decisions: Decision[];
    discussions: DiscussionDigest[];
    tasks: TaskRef[];
    plans: Plan[];
    autonomy: AutonomyMode;
    updatedAt: string;
};
export declare function emptyLedger(now?: string): CeoLedger;
export declare const RESOURCE_URIS: {
    readonly roadmapCurrent: "attest://ceo/roadmap/current";
    readonly commitmentsOpen: "attest://ceo/commitments/open";
    readonly decisionsLog: "attest://ceo/decisions/log";
    readonly autonomy: "attest://ceo/autonomy/current";
};
export declare const DEFAULT_CONDUCTOR_DISPATCH_TOOL = "run_autopilot_task";
/** CEO director feature flag (OFF by default; director worker flips it on). */
export declare function directorEnabled(env?: NodeJS.ProcessEnv): boolean;
//# sourceMappingURL=types.d.ts.map