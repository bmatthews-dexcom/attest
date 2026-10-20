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

import {
  DEFAULT_CONDUCTOR_DISPATCH_TOOL,
  type AutonomyMode,
  type ChiefTaskStatus,
  type Plan,
  type PlanStep,
} from "./types.js";

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

export type SkippedReason =
  | { kind: "non-approved"; approvalState: Plan["approvalState"] }
  | { kind: "autonomy-blocks"; autonomy: AutonomyMode }
  | { kind: "docs-only-step"; stepId: string }
  | { kind: "already-dispatched"; stepId: string; chiefTaskId: string };

export type DispatchInput = {
  plan: Plan;
  autonomyMode: AutonomyMode;
  conductorTool?: string;
};

export function buildDispatchBlueprint(input: DispatchInput): DispatchBlueprint {
  const skipped: SkippedReason[] = [];
  const calls: DispatchCall[] = [];
  const conductorTool = input.conductorTool ?? DEFAULT_CONDUCTOR_DISPATCH_TOOL;
  const mode = input.plan.dispatchMode ?? "sequenced";

  // Approval + autonomy gates.
  const needsApproval =
    input.autonomyMode === "draft-and-approve" ||
    input.autonomyMode === "draft-only" ||
    input.autonomyMode === "nudge" ||
    input.autonomyMode === "watch";
  const approved = input.plan.approvalState === "approved";

  if (input.autonomyMode === "watch" || input.autonomyMode === "nudge" || input.autonomyMode === "draft-only") {
    skipped.push({ kind: "autonomy-blocks", autonomy: input.autonomyMode });
    return {
      planId: input.plan.id,
      mode,
      conductorTool,
      autonomy: input.autonomyMode,
      calls: [],
      skipped,
    };
  }

  if (needsApproval && !approved) {
    skipped.push({ kind: "non-approved", approvalState: input.plan.approvalState });
    return {
      planId: input.plan.id,
      mode,
      conductorTool,
      autonomy: input.autonomyMode,
      calls: [],
      skipped,
    };
  }

  for (const step of input.plan.steps) {
    if (step.dispatch === null) {
      skipped.push({ kind: "docs-only-step", stepId: step.id });
      continue;
    }
    if (step.chiefTaskId && step.state !== "pending") {
      skipped.push({
        kind: "already-dispatched",
        stepId: step.id,
        chiefTaskId: step.chiefTaskId,
      });
      continue;
    }
    calls.push({
      stepId: step.id,
      description: step.description,
      input: {
        goal: buildChiefGoal(input.plan, step),
      },
      scope: step.dispatch.scope,
      phaseHint: step.dispatch.phaseHint ?? null,
    });
  }

  return {
    planId: input.plan.id,
    mode,
    conductorTool,
    autonomy: input.autonomyMode,
    calls,
    skipped,
  };
}

function buildChiefGoal(plan: Plan, step: PlanStep): string {
  const lines = [
    `[attest-ceo plan ${plan.id} step ${step.id}]`,
    plan.title,
    "",
    step.description,
  ];
  if (plan.commitmentIds.length) {
    lines.push("", "Relevant commitments:");
    for (const cid of plan.commitmentIds) {
      lines.push(`  - ${cid}`);
    }
  }
  if (step.dispatch?.scope) {
    lines.push("", `Scope: ${step.dispatch.scope}`);
  }
  return lines.join("\n");
}

/**
 * Phase-1 mock for `attest://tasks/<id>/status.json`. Replace once the
 * sibling attest-mcp Shape C resource lands.
 */
export function mockTaskStatus(taskId: string): ChiefTaskStatus {
  return {
    taskId,
    status: "running",
    currentPhase: "intake",
    iteration: 0,
    iterationCap: 6,
    openFindings: 0,
    lastSummary: "mock status — attest-mcp status resource not yet available",
    updatedAt: new Date().toISOString(),
  };
}
