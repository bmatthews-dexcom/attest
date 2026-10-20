/**
 * experts/types.ts — public contract for Shape-C in-process expert handlers.
 *
 * The sibling attest-conductor and attest-experts Shape-C workers bind to
 * the exact `Capability` and `InProcessExpertHandler` interfaces defined
 * here. Any change to these shapes is a cross-package break — coordinate
 * via the chief architecture doc before touching them.
 *
 * See docs/attest-chief-architecture.md §Recommendation and §Fences
 * inventory for the capability taxonomy and how fences map to the policy
 * engine.
 */

/**
 * Capability kinds the Cedar policy engine reasons about. Mirrors the
 * fences inventory table verbatim; adding a new kind requires:
 *   1. updating the Cedar schema (`src/policy/schema.cedarschema`)
 *   2. adding a seed policy or extending an existing one
 *   3. updating `isCapabilityKind` below
 */
export type CapabilityKind =
  | "read:fs"
  | "write:fs"
  | "shell:safe"
  | "shell:destructive"
  | "net:fetch"
  | "git:read"
  | "git:write"
  | "pr:open"
  | "pr:merge"
  | "publish:npm"
  | "env:write";

const CAPABILITY_KINDS: readonly CapabilityKind[] = [
  "read:fs",
  "write:fs",
  "shell:safe",
  "shell:destructive",
  "net:fetch",
  "git:read",
  "git:write",
  "pr:open",
  "pr:merge",
  "publish:npm",
  "env:write",
];

export function isCapabilityKind(value: unknown): value is CapabilityKind {
  return typeof value === "string" && (CAPABILITY_KINDS as readonly string[]).includes(value);
}

/**
 * A capability a handler needs. `scope` is required for `write:fs` (per
 * the brief) — it names the glob or path the handler intends to write to,
 * which the policy engine can match against the active phase's write-glob
 * fence. Scope is optional and informational for every other kind.
 */
export interface Capability {
  readonly kind: CapabilityKind;
  readonly scope?: string;
}

/**
 * Minimal input shape for an in-process expert. The schema matches the
 * sibling BDK expert's `invoke` contract: a free-text goal plus an optional
 * payload of structured arguments and the active phase/task context the
 * conductor already has in hand. Handlers that need the attest persona can
 * fetch it via `loadPersonaFromAttestSource` from
 * `src/experts/handlers/persona.ts`.
 */
export interface ExpertInput {
  /** The free-text goal / request the chief wants the expert to work on. */
  readonly goal: string;
  /** Project root to analyse (defaults to $ATTEST_TARGET_ROOT). */
  readonly projectRoot?: string;
  /** Current SDLC phase id, when the chief knows one. */
  readonly phase?: string;
  /** Short-form task id the handler can reference in its output. */
  readonly taskId?: string;
  /** Structured, handler-specific arguments. */
  readonly args?: Record<string, unknown>;
}

/**
 * Structured return shape, matching the sibling BDK expert's `submit-report`
 * schema. `findings` carries any gaps/issues the handler surfaced;
 * `data` is a handler-specific payload. `transcript` is the LLM
 * conversation that produced the report, when the handler is backed by an
 * LLM; omitted for pure-shell / pure-parser handlers.
 */
export interface ExpertOutput {
  readonly ok: boolean;
  readonly expertId: string;
  readonly summary: string;
  readonly findings: ExpertFinding[];
  readonly data?: Record<string, unknown>;
  readonly transcript?: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  readonly runtimeMs: number;
}

export interface ExpertFinding {
  readonly category: string;
  readonly severity: "info" | "low" | "medium" | "high" | "critical";
  readonly detail: string;
  readonly location?: string;
}

/**
 * Persona source. Handlers may ship an inline string or a loader that
 * resolves lazily (e.g. from the attest source bundle). Lazy loaders are
 * preferred when the persona lives in the attest source tree — the chief
 * stays in sync with upstream edits without a redeploy.
 */
export type PersonaSource = string | (() => Promise<string>);

/**
 * The public contract. The sibling attest-conductor and attest-experts
 * workers consume this verbatim; its string literal types feed the Cedar
 * schema entity attribute types so cross-package drift surfaces as a
 * TypeScript error, not a policy decision divergence.
 */
export interface InProcessExpertHandler {
  /** Kebab-case id matching `attest/agents/<id>.md`. */
  readonly id: string;
  /** Expert cluster from attest's registry (`security`, `code-quality`, ...). */
  readonly cluster: string;
  /** Persona body, inline or lazy. */
  readonly persona: PersonaSource;
  /** Capabilities the policy engine will evaluate before invocation. */
  readonly requiredCapabilities: readonly Capability[];
  /** The real work. Called once the policy engine returns `allow`. */
  invoke(input: ExpertInput): Promise<ExpertOutput>;
}

/**
 * Error shape returned by the `invoke_expert` tool when the policy engine
 * blocks the call. Clients consume this as a structured JSON-RPC error
 * payload (per bot-marshal ADR 0013) rather than an HTTP-status-coded
 * failure.
 */
export interface PolicyDeniedError {
  readonly kind: "policy_denied";
  readonly expertId: string;
  readonly capability: Capability;
  readonly reason: string;
  readonly determiningPolicies: readonly string[];
}

/**
 * Error shape returned when the policy engine returned `requireApproval`
 * and the HITL transport declined, cancelled, or wasn't available.
 */
export interface ApprovalRequiredError {
  readonly kind: "approval_required";
  readonly expertId: string;
  readonly capability: Capability;
  readonly reason: string;
  /**
   * One of:
   *   - `declined`  — human chose decline/cancel
   *   - `unavailable` — the connected client doesn't support elicitation
   *   - `error` — the transport raised before returning a decision
   */
  readonly outcome: "declined" | "unavailable" | "error";
  readonly detail?: string;
}
