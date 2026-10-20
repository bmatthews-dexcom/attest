/**
 * plan.ts — turn one or more intents (+ a block of context) into a
 * draft plan the CEO can surface to Bradford.
 *
 * Same posture as `intent.ts`: deterministic, LLM-free, deliberately
 * cheap. The CEO agent itself drafts the richer plans at run time; this
 * module gives tests and tool clients a predictable baseline, and
 * handles the schema wiring once (ids, timestamps, approval state).
 */
import { randomUUID } from "node:crypto";
/**
 * Produce a draft plan: one chief-dispatchable step plus (if the
 * intent is a `decision` / `question`) a docs-only coordination step.
 */
export function draftPlan(input) {
    const now = new Date().toISOString();
    const planId = `pln-${now.slice(0, 10).replace(/-/g, "")}-${randomUUID().slice(0, 6)}`;
    const title = titleFor(input.intent);
    const rationale = rationaleFor(input.intent, input.context?.commitments);
    const commitmentIds = (input.context?.commitments ?? []).map((c) => c.id);
    const steps = buildSteps(input, planId);
    return {
        id: planId,
        version: 1,
        title,
        rationale,
        commitmentIds,
        steps,
        approvalState: "awaiting-approval",
        estimatedChiefSessions: steps.filter((s) => s.dispatch !== null).length,
        riskNotes: riskNotesFor(input.intent),
        createdAt: now,
        updatedAt: now,
        dispatchMode: input.dispatchMode ?? "sequenced",
    };
}
function titleFor(intent) {
    const stem = intent.summary.split(/[.?!]/)[0].trim();
    const trimmed = stem.length > 80 ? stem.slice(0, 77) + "…" : stem;
    switch (intent.kind) {
        case "bug":
            return `Fix: ${trimmed}`;
        case "finding":
            return `Investigate: ${trimmed}`;
        case "decision":
            return `Decision: ${trimmed}`;
        case "question":
            return `Resolve: ${trimmed}`;
        case "chore":
            return `Chore: ${trimmed}`;
        default:
            return `Build: ${trimmed}`;
    }
}
function rationaleFor(intent, commitments) {
    const linked = (commitments ?? [])
        .map((c) => `  - ${c.id} (${c.state}): ${c.text.slice(0, 120)}`)
        .join("\n");
    const linkedBlock = linked ? `\n\nLinked commitments:\n${linked}` : "";
    return (`Intent kind: ${intent.kind}; confidence ${intent.confidence.toFixed(2)}; source episode ${intent.sourceEpisode}.` +
        `\n\n${intent.summary}` +
        linkedBlock);
}
function buildSteps(input, planId) {
    const intent = input.intent;
    const scope = input.context?.scopeHint ??
        (intent.kind === "finding" ? "." : "docs/work/");
    const phaseHint = input.context?.phaseHint ?? null;
    const dispatch = {
        scope,
        phaseHint,
        autonomy: "interactive",
    };
    const steps = [];
    if (intent.kind === "decision" || intent.kind === "question") {
        steps.push({
            id: `${planId}-step-1`,
            description: `Capture outcome in docs/work/decisions/ and update commitments.`,
            dispatch: null,
            state: "pending",
            chiefTaskId: null,
        });
        if (intent.kind === "question") {
            steps.push({
                id: `${planId}-step-2`,
                description: `If the answer requires code work, follow up with a chief dispatch (scope: ${scope}).`,
                dispatch,
                state: "pending",
                chiefTaskId: null,
            });
        }
        return steps;
    }
    steps.push({
        id: `${planId}-step-1`,
        description: `Dispatch chief to address: ${intent.summary.slice(0, 180)}.`,
        dispatch,
        state: "pending",
        chiefTaskId: null,
    });
    return steps;
}
function riskNotesFor(intent) {
    if (intent.confidence < 0.6) {
        return `Low-confidence intent (${intent.confidence.toFixed(2)}); review the source episode before approving.`;
    }
    if (intent.kind === "bug") {
        return "Bug plan — chief will inherit docs/work/ scope by default; widen deliberately via approval.";
    }
    if (intent.kind === "new-feature") {
        return "New feature — ensure the plan step scope matches the chief's write:src/ policy before approving.";
    }
    return `Routine plan; no elevated-risk notes.`;
}
/**
 * Approve a plan: flips state and bumps timestamp. Dispatch is a
 * separate step owned by `dispatch_plan`.
 */
export function approvePlan(plan) {
    return {
        ...plan,
        approvalState: "approved",
        updatedAt: new Date().toISOString(),
    };
}
export function denyPlan(plan) {
    return {
        ...plan,
        approvalState: "denied",
        updatedAt: new Date().toISOString(),
    };
}
/**
 * Produce a new plan version with a modified intent summary (e.g.
 * `/ceo refine`). Keeps the original around; the CEO ledger holds
 * both versions.
 */
export function refinePlan(plan, refinedTitle, refinedRationale) {
    const now = new Date().toISOString();
    return {
        ...plan,
        version: plan.version + 1,
        title: refinedTitle,
        rationale: refinedRationale,
        approvalState: "awaiting-approval",
        updatedAt: now,
    };
}
//# sourceMappingURL=plan.js.map