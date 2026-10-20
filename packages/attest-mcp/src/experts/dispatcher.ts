/**
 * experts/dispatcher.ts — the policy-mediated single entrypoint for every
 * in-process expert call.
 *
 * Flow (per Shape-C design doc §3.3):
 *   1. Resolve the handler by `expert_id`
 *   2. For each required capability, call `evaluatePolicy(context)`
 *   3. If any decision is `deny` under ENFORCE → return `PolicyDeniedError`
 *   4. If any decision is `requireApproval` under ENFORCE → route through
 *      the elicitation gate; on anything other than `accepted` return
 *      `ApprovalRequiredError`
 *   5. On full `allow` (or when policy mode is OFF/LOG_ONLY), run the
 *      handler and return `ExpertOutput`
 *
 * The audit log records every decision regardless of mode — the chokepoint
 * is observable even when it's not enforcing.
 */

import type {
  ApprovalRequiredError,
  Capability,
  ExpertInput,
  ExpertOutput,
  InProcessExpertHandler,
  PolicyDeniedError,
} from "./types.js";
import type {
  AutonomyMode,
  PolicyContext,
  PolicyDecision,
} from "../policy/types.js";
import { getPolicyEngine } from "../policy/engine.js";
import {
  getInProcessHandler,
  hasInProcessHandler,
  listInProcessHandlers,
} from "./registry-handlers.js";
import {
  requestApprovalViaElicitation,
  type ApprovalTransport,
} from "../elicitation/approval.js";

export interface DispatchRequest {
  readonly expertId: string;
  readonly input: ExpertInput;
  readonly phase?: string;
  readonly taskId?: string;
  readonly autonomyMode?: AutonomyMode;
  readonly toolName?: string;
  /**
   * Reason text surfaced to the HITL approver. Defaults to a terse
   * description built from the capability.
   */
  readonly reasonForApproval?: string;
}

/**
 * Discriminated union consumed by the attest-conductor (PR #14) via its
 * `invoke_expert` / `pre_dispatch_check` MCP tool calls. The conductor
 * contract mandates `kind` ∈ {`expert_output`, `policy_denied`,
 * `approval_required`} — any drift surfaces as `InvokeExpertParseError`
 * on the conductor side. Snake_case or camelCase payload fields are both
 * accepted; this package emits snake_case fields in the MCP response
 * body (see `runDispatchAndFormat` in `src/server.ts`).
 *
 * We internally keep an extra "no handler for this id" case that maps
 * onto `policy_denied` when the MCP response is formatted (an unknown
 * expert is, from the policy POV, a dispatch the server refuses to
 * perform; grouping it under `policy_denied` keeps the conductor's
 * three-case switch complete).
 */
export type DispatchResult =
  | { kind: "expert_output"; output: ExpertOutput; decisions: readonly PolicyDecision[] }
  | { kind: "unknown_expert"; expertId: string; registered: readonly string[] }
  | { kind: "policy_denied"; error: PolicyDeniedError; decision: PolicyDecision }
  | { kind: "approval_required"; error: ApprovalRequiredError; decision: PolicyDecision };

export interface DispatcherOptions {
  readonly approvalTransport?: ApprovalTransport;
}

/**
 * Run one dispatch end to end. Pure of McpServer coupling: the only
 * server-aware piece is `approvalTransport`, which the server injects at
 * construction (see `src/server.ts`).
 */
export async function dispatchInProcess(
  request: DispatchRequest,
  options: DispatcherOptions = {},
): Promise<DispatchResult> {
  const engine = getPolicyEngine();
  const handler = getInProcessHandler(request.expertId);
  if (!handler) {
    return {
      kind: "unknown_expert",
      expertId: request.expertId,
      registered: listInProcessHandlers().map((h) => h.id),
    };
  }

  const autonomyMode: AutonomyMode = request.autonomyMode ?? "interactive";
  const phase = request.phase ?? request.input.phase ?? "unknown";
  const toolName = request.toolName ?? `invoke_expert_${request.expertId.replace(/-/g, "_")}`;
  const decisions: PolicyDecision[] = [];

  for (const capability of handler.requiredCapabilities) {
    const policyContext: PolicyContext = {
      expertId: handler.id,
      cluster: handler.cluster,
      capability,
      phase,
      taskId: request.taskId ?? request.input.taskId,
      autonomyMode,
      toolName,
      reason: request.reasonForApproval,
    };
    const decision = engine.evaluatePolicy(policyContext);
    decisions.push(decision);

    if (decision.effective === "deny") {
      return {
        kind: "policy_denied",
        error: {
          kind: "policy_denied",
          expertId: handler.id,
          capability,
          reason: decision.reason,
          determiningPolicies: decision.determiningPolicies,
        },
        decision,
      };
    }

    if (decision.effective === "requireApproval") {
      if (!options.approvalTransport) {
        return {
          kind: "approval_required",
          error: {
            kind: "approval_required",
            expertId: handler.id,
            capability,
            reason: decision.reason,
            outcome: "unavailable",
            detail: "no elicitation transport attached to this server (set up MCP elicitation or route via request_approval)",
          },
          decision,
        };
      }
      const failure = await requestApprovalViaElicitation(options.approvalTransport, {
        expertId: handler.id,
        capability,
        reason: decision.reason,
        phase,
        autonomyMode,
        toolName,
      });
      if (failure) {
        return { kind: "approval_required", error: failure, decision };
      }
      // Approval granted — fall through and keep evaluating remaining
      // capabilities. We do NOT re-run the engine here; the human said
      // yes, that answers the requireApproval verdict for this call.
    }
  }

  const output = await handler.invoke(request.input);
  return { kind: "expert_output", output, decisions };
}

/**
 * Convenience: build the capability inventory for the catalog resource.
 * Flat shape so the attest-conductor Shape-C worker can diff against the
 * policy bundle without parsing TypeScript.
 */
export interface HandlerDescriptor {
  readonly id: string;
  readonly cluster: string;
  readonly requiredCapabilities: readonly Capability[];
  readonly toolName: string;
  readonly resourceUri: string;
}

export function describeHandler(h: InProcessExpertHandler): HandlerDescriptor {
  return {
    id: h.id,
    cluster: h.cluster,
    requiredCapabilities: h.requiredCapabilities,
    toolName: toolNameForHandler(h.id),
    resourceUri: `attest://experts/${h.id}/handler`,
  };
}

export function toolNameForHandler(id: string): string {
  const safe = id.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  return `invoke_expert_${safe}`;
}

export function describeAllHandlers(): HandlerDescriptor[] {
  return listInProcessHandlers().map(describeHandler);
}
