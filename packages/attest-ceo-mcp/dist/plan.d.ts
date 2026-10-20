/**
 * plan.ts — turn one or more intents (+ a block of context) into a
 * draft plan the CEO can surface to Bradford.
 *
 * Same posture as `intent.ts`: deterministic, LLM-free, deliberately
 * cheap. The CEO agent itself drafts the richer plans at run time; this
 * module gives tests and tool clients a predictable baseline, and
 * handles the schema wiring once (ids, timestamps, approval state).
 */
import { type Commitment, type Intent, type Plan } from "./types.js";
export type DraftPlanInput = {
    /** Primary intent to plan around. */
    intent: Intent;
    /**
     * Already-open commitments relevant to the intent. The caller is
     * responsible for selecting these; the drafter just links them.
     */
    context?: {
        commitments?: Commitment[];
        scopeHint?: string;
        phaseHint?: string;
        priorityBand?: Plan["commitmentIds"] extends never ? never : "p0" | "p1" | "p2" | "p3";
    };
    /** Dispatch mode. Default: sequenced. */
    dispatchMode?: "concurrent" | "sequenced";
};
/**
 * Produce a draft plan: one chief-dispatchable step plus (if the
 * intent is a `decision` / `question`) a docs-only coordination step.
 */
export declare function draftPlan(input: DraftPlanInput): Plan;
/**
 * Approve a plan: flips state and bumps timestamp. Dispatch is a
 * separate step owned by `dispatch_plan`.
 */
export declare function approvePlan(plan: Plan): Plan;
export declare function denyPlan(plan: Plan): Plan;
/**
 * Produce a new plan version with a modified intent summary (e.g.
 * `/ceo refine`). Keeps the original around; the CEO ledger holds
 * both versions.
 */
export declare function refinePlan(plan: Plan, refinedTitle: string, refinedRationale: string): Plan;
//# sourceMappingURL=plan.d.ts.map