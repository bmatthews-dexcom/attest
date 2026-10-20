/**
 * policy/types.ts — shared types for the Shape-C Cedar policy engine.
 *
 * The policy engine is the authoritative chokepoint for every `tools/call`
 * that invokes an in-process expert handler (see src/experts/dispatcher.ts).
 * Discovery-time filtering (`advertiseTools` / `tools/list` strip) is
 * cosmetic per Shield's framing — the enforcement decision lives here, is
 * audited in `audit.ts`, and feeds HITL approval through
 * `src/elicitation/approval.ts` when the policy returns `requireApproval`.
 *
 * See docs/attest-chief-architecture.md §Fences inventory for the capability
 * taxonomy this module reasons about.
 */

import type { Capability, CapabilityKind } from "../experts/types.js";
export type { Capability, CapabilityKind };

/**
 * Three enforcement modes, matching the AgentCore convention cited in the
 * research notes (LOG_ONLY vs ENFORCE) plus a hard OFF for local dev when a
 * policy bundle is being iterated on and you want the server to pass through
 * every call without any evaluation at all.
 *
 * Default is `ENFORCE`. Switch via the `ATTEST_POLICY_MODE` env var
 * (`off` | `log` | `log_only` | `enforce`, case-insensitive).
 */
export type PolicyMode = "OFF" | "LOG_ONLY" | "ENFORCE";

/**
 * Normalise free-text (env var, config file, test input) into a PolicyMode.
 * Returns `ENFORCE` for any unrecognised value (fail-safe default per the
 * Shape-C design doc §Recommendation).
 */
export function parsePolicyMode(raw: string | undefined | null): PolicyMode {
  if (!raw) return "ENFORCE";
  const normalised = raw.trim().toLowerCase();
  if (normalised === "off" || normalised === "disabled" || normalised === "none") {
    return "OFF";
  }
  if (normalised === "log" || normalised === "log_only" || normalised === "log-only" || normalised === "logonly") {
    return "LOG_ONLY";
  }
  return "ENFORCE";
}

/**
 * Autonomy mode drives which HITL transport we try first (elicitation vs
 * GitHub comment) — the attest-conductor Shape-C worker owns the GitHub
 * path, but the policy context carries the mode so this package stays in
 * sync with its sibling. See `src/elicitation/approval.ts` for how it's
 * consulted here.
 */
export type AutonomyMode = "interactive" | "auto";

/**
 * Input context passed to `evaluatePolicy`. Every field is used by the
 * Cedar schema in `src/policy/schema.cedarschema`.
 */
export interface PolicyContext {
  /** The expert handler id attempting the call (e.g. `security-auditor`). */
  readonly expertId: string;
  /** The expert's cluster, mirrors the expert registry. */
  readonly cluster: string;
  /** The capability the expert is asking to exercise. */
  readonly capability: Capability;
  /** Active SDLC phase id, e.g. `phase-4`. May be `unknown` when no task carries one. */
  readonly phase: string;
  /** Short-form task id for the audit log. Not used by Cedar policies today. */
  readonly taskId?: string;
  /** Autonomy mode (drives HITL transport selection). */
  readonly autonomyMode: AutonomyMode;
  /**
   * The MCP tool name that triggered this evaluation. Carried so the audit
   * log can correlate decisions with the client's call stream.
   */
  readonly toolName: string;
  /**
   * Human-readable reason for the request, surfaced to the HITL approver
   * when the decision is `requireApproval`. Optional.
   */
  readonly reason?: string;
}

/**
 * Final decision shape returned by `evaluatePolicy`. The three outcomes
 * match the Vercel AI-SDK policy-tool-approvals contract cited in the
 * design doc.
 */
export type PolicyDecisionKind = "allow" | "deny" | "requireApproval";

export interface PolicyDecision {
  readonly decision: PolicyDecisionKind;
  /**
   * Cedar policy ids whose `permit` or `forbid` matched. Empty when the
   * default-deny posture applies.
   */
  readonly determiningPolicies: readonly string[];
  /**
   * Policy ids that errored during evaluation (parse failures, type errors
   * — we treat these as deny-by-default but surface them for debugging).
   */
  readonly erroringPolicies: readonly string[];
  /**
   * Short human reason explaining the decision — "default-deny",
   * "permitted by 10-read-fs-always-allowed", "approval required".
   */
  readonly reason: string;
  /** The mode that was active when the decision was made. */
  readonly mode: PolicyMode;
  /**
   * The effective outcome actually enforced — in `OFF` and `LOG_ONLY` this
   * is always `"allow"` regardless of the engine's `decision`; in `ENFORCE`
   * it matches `decision`. Audit log consumers key on this field.
   */
  readonly effective: PolicyDecisionKind;
}

/**
 * Structured record written to the policy audit log. One line per
 * `evaluatePolicy` call.
 */
export interface PolicyAuditRecord {
  readonly ts: string;
  readonly mode: PolicyMode;
  readonly decision: PolicyDecisionKind;
  readonly effective: PolicyDecisionKind;
  readonly expertId: string;
  readonly cluster: string;
  readonly capability: Capability;
  readonly phase: string;
  readonly taskId?: string;
  readonly autonomyMode: AutonomyMode;
  readonly toolName: string;
  readonly reason: string;
  readonly determiningPolicies: readonly string[];
  readonly erroringPolicies: readonly string[];
}
