/**
 * policy/engine.ts — Cedar-backed policy evaluator for every in-process
 * `invoke_expert` call.
 *
 * Design mirrors AgentCore's two-mode rollout (LOG_ONLY → ENFORCE), plus an
 * explicit OFF for local dev iteration. The authoritative chokepoint is
 * right here: the dispatcher calls `evaluatePolicy()` before touching the
 * handler, and routes on the returned `effective` decision.
 *
 * Three outcomes:
 *   - `allow`           — the `Invoke` action was permitted
 *   - `requireApproval` — `Invoke` denied but `Approve` permitted, so the
 *                         capability is reachable via an HITL elicitation
 *   - `deny`            — both actions denied, no fence open
 *
 * Audit logging is always on — even under `OFF` we record the record with
 * `effective: "allow"` so that an operator reviewing the log sees the
 * decision the policy engine WOULD have made alongside the mode.
 */

import {
  checkParsePolicySet,
  checkParseSchema,
  getCedarVersion,
  isAuthorized,
  type AuthorizationCall,
  type Context,
  type Decision,
  type EntityJson,
  type PolicySet,
  type Schema,
} from "@cedar-policy/cedar-wasm/nodejs";

import {
  parsePolicyMode,
  type PolicyContext,
  type PolicyDecision,
  type PolicyDecisionKind,
  type PolicyMode,
  type PolicyAuditRecord,
} from "./types.js";
import { loadPolicyBundle, type PolicyBundle } from "./loader.js";
import { createAuditSink, type AuditSink } from "./audit.js";

export interface PolicyEngineOptions {
  readonly mode?: PolicyMode;
  readonly auditSink?: AuditSink;
  /** Hook for tests: override the clock used in audit timestamps. */
  readonly now?: () => Date;
}

export class PolicyEngine {
  readonly #mode: PolicyMode;
  readonly #bundle: PolicyBundle;
  readonly #schema: Schema;
  readonly #policies: PolicySet;
  readonly #audit: AuditSink;
  readonly #now: () => Date;

  constructor(options: PolicyEngineOptions = {}) {
    this.#mode = options.mode ?? parsePolicyMode(process.env.ATTEST_POLICY_MODE);
    this.#bundle = loadPolicyBundle();

    // Fail fast on a malformed bundle rather than discovering it on the
    // first `tools/call` — the server would otherwise come up looking
    // healthy and then start denying everything with cryptic errors.
    const schemaParse = checkParseSchema(this.#bundle.schemaText);
    if (schemaParse.type === "failure") {
      throw new Error(
        `attest-mcp Cedar schema failed to parse: ${JSON.stringify(schemaParse.errors)}`,
      );
    }
    const policyMap: Record<string, string> = {};
    for (const p of this.#bundle.policies) policyMap[p.id] = p.text;
    const policyParse = checkParsePolicySet({ staticPolicies: policyMap });
    if (policyParse.type === "failure") {
      throw new Error(
        `attest-mcp Cedar policies failed to parse: ${JSON.stringify(policyParse.errors)}`,
      );
    }
    this.#schema = this.#bundle.schemaText;
    this.#policies = { staticPolicies: policyMap };

    this.#audit = options.auditSink ?? createAuditSink();
    this.#now = options.now ?? (() => new Date());
  }

  get mode(): PolicyMode {
    return this.#mode;
  }

  get cedarVersion(): string {
    return getCedarVersion();
  }

  get policyIds(): readonly string[] {
    return this.#bundle.policies.map((p) => p.id);
  }

  /**
   * Core entrypoint. The returned decision's `effective` field is what
   * the dispatcher enforces; `decision` is what the policies said. In
   * `LOG_ONLY` and `OFF` mode they diverge (`effective === "allow"`).
   */
  evaluatePolicy(context: PolicyContext): PolicyDecision {
    const invokeDecision = this.#runCedar("Invoke", context);
    let finalKind: PolicyDecisionKind;
    let reason: string;
    let determining: readonly string[];
    let erroring: readonly string[];

    if (invokeDecision.decision === "allow") {
      finalKind = "allow";
      reason = this.#reasonForAllow(invokeDecision.determiningPolicies);
      determining = invokeDecision.determiningPolicies;
      erroring = invokeDecision.erroringPolicies;
    } else {
      const approveDecision = this.#runCedar("Approve", context);
      if (approveDecision.decision === "allow") {
        finalKind = "requireApproval";
        reason = `human approval required (Approve permitted by ${approveDecision.determiningPolicies.join(", ") || "<policy>"})`;
        determining = approveDecision.determiningPolicies;
        erroring = [...invokeDecision.erroringPolicies, ...approveDecision.erroringPolicies];
      } else {
        finalKind = "deny";
        reason = this.#reasonForDeny(invokeDecision.determiningPolicies);
        determining = invokeDecision.determiningPolicies;
        erroring = [...invokeDecision.erroringPolicies, ...approveDecision.erroringPolicies];
      }
    }

    const effective: PolicyDecisionKind =
      this.#mode === "ENFORCE" ? finalKind : "allow";

    const decision: PolicyDecision = {
      decision: finalKind,
      determiningPolicies: determining,
      erroringPolicies: erroring,
      reason,
      mode: this.#mode,
      effective,
    };

    this.#writeAudit(context, decision);
    return decision;
  }

  // ── private ─────────────────────────────────────────────────────────

  #runCedar(
    action: "Invoke" | "Approve",
    context: PolicyContext,
  ): { decision: Decision; determiningPolicies: string[]; erroringPolicies: string[] } {
    const capabilityUid = capabilityEntityId(context.capability.kind, context.capability.scope);
    const call: AuthorizationCall = {
      principal: { type: "attest::Expert", id: context.expertId },
      action: { type: "attest::Action", id: action },
      resource: { type: "attest::Capability", id: capabilityUid },
      context: cedarContext(context),
      entities: buildEntities(context, capabilityUid),
      policies: this.#policies,
      schema: this.#schema,
      validateRequest: true,
    };
    const result = isAuthorized(call);
    if (result.type === "failure") {
      // A validation failure is a policy or schema bug — treat as deny
      // but surface the error ids so an operator can diagnose from the
      // audit log.
      return {
        decision: "deny",
        determiningPolicies: [],
        erroringPolicies: result.errors.map((e) => extractPolicyId(e.message) ?? "<validation>"),
      };
    }
    return {
      decision: result.response.decision,
      determiningPolicies: Array.from(result.response.diagnostics.reason),
      erroringPolicies: result.response.diagnostics.errors.map((e) => e.policyId),
    };
  }

  #reasonForAllow(determining: readonly string[]): string {
    if (determining.length === 0) return "allowed (no determining policy)";
    return `permitted by ${determining.join(", ")}`;
  }

  #reasonForDeny(determining: readonly string[]): string {
    if (determining.length === 0) return "default-deny: no permit matched";
    return `denied by ${determining.join(", ")}`;
  }

  #writeAudit(context: PolicyContext, decision: PolicyDecision): void {
    const record: PolicyAuditRecord = {
      ts: this.#now().toISOString(),
      mode: decision.mode,
      decision: decision.decision,
      effective: decision.effective,
      expertId: context.expertId,
      cluster: context.cluster,
      capability: context.capability,
      phase: context.phase,
      taskId: context.taskId,
      autonomyMode: context.autonomyMode,
      toolName: context.toolName,
      reason: decision.reason,
      determiningPolicies: decision.determiningPolicies,
      erroringPolicies: decision.erroringPolicies,
    };
    try {
      this.#audit.write(record);
    } catch (err) {
      // The audit path is almost always the mode of failure (fs full,
      // permission denied). We write to stderr once so an operator sees
      // it in logs; we do NOT silently drop or crash.
      process.stderr.write(
        `[attest-mcp policy] audit sink write failed: ${(err as Error).message}\n`,
      );
    }
  }
}

/**
 * Attach the capability scope (if any) to the entity id so each distinct
 * scope has its own Cedar Capability entity. Scope-less kinds use the
 * bare kind as the id (`read:fs`), scoped kinds get `kind|scope`
 * (`write:fs|docs/work/`).
 */
export function capabilityEntityId(kind: string, scope?: string): string {
  if (!scope) return kind;
  return `${kind}|${scope}`;
}

function cedarContext(ctx: PolicyContext): Context {
  return {
    phase: ctx.phase,
    autonomyMode: ctx.autonomyMode,
  };
}

function buildEntities(ctx: PolicyContext, capabilityUid: string): EntityJson[] {
  return [
    {
      uid: { type: "attest::Expert", id: ctx.expertId },
      attrs: { cluster: ctx.cluster },
      parents: [],
    },
    {
      uid: { type: "attest::Capability", id: capabilityUid },
      attrs: {
        kind: ctx.capability.kind,
        scope: ctx.capability.scope ?? "",
      },
      parents: [],
    },
  ];
}

/** Pull a `<policy-id>:` prefix out of a Cedar error message, when present. */
function extractPolicyId(message: string): string | null {
  const m = message.match(/policy\s+(?:`|")([^`"\s]+)/i);
  return m ? m[1] : null;
}

/**
 * Module-level singleton accessor so the server's many register-time
 * callers all share one engine (one audit sink, one bundle load).
 * Tests reset via `resetPolicyEngineSingleton()`.
 */
let singleton: PolicyEngine | null = null;

export function getPolicyEngine(options?: PolicyEngineOptions): PolicyEngine {
  if (!singleton) singleton = new PolicyEngine(options);
  return singleton;
}

export function resetPolicyEngineSingleton(): void {
  singleton = null;
}
