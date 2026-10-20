/**
 * Thin TS adapter over attest-mcp's `invoke_expert` MCP tool.
 *
 * Shape C moves transport routing (sibling BDK sandbox vs in-process
 * handler) out of the conductor and into attest-mcp. The conductor just
 * asks `invoke_expert({ expertId, input, taskId, phase })` and gets one
 * of three outcomes back:
 *
 *   - `ExpertOutput` — the expert ran and produced a report. Feed to Ralph.
 *   - `PolicyDenied` — the policy engine refused with a reason. Surface
 *     to Ralph as a structured tool result so the loop can escalate /
 *     route differently (never retry blindly).
 *   - `ApprovalRequired` — the policy engine wants a human in the loop
 *     first. The Ralph loop calls `request_approval` to resolve, then
 *     re-tries `invoke_expert` with the approval id attached.
 *
 * The wire protocol lives in the sibling attest-mcp PR. We tolerate three
 * shapes defensively because the server contract and this adapter are
 * being written in parallel:
 *
 *   { kind: "expert_output", result }
 *   { kind: "policy_denied", reason, capability? }
 *   { kind: "approval_required", capability, approver, prompt, ... }
 *
 * …and also the SDK-style wrapper:
 *
 *   { content: [{ type: "text", text: "<json>" }] }
 *
 * The three-outcome discriminated union is the stable public surface the
 * Ralph loop + tests consume. Contract mismatches with attest-mcp bubble
 * up via `InvokeExpertParseError` so the conductor can escalate rather
 * than silently misinterpret the server.
 */

export type InvokeExpertInput = {
  expertId: string;
  taskId: string;
  phase?: string;
  prompt?: string;
  input?: Record<string, unknown>;
  /** When re-invoking after `request_approval` resolved, pass the approval id. */
  approvalId?: string;
};

export type InvokeExpertOutcome =
  | {
      kind: "expert_output";
      expertId: string;
      summary: string;
      result: Record<string, unknown>;
    }
  | {
      kind: "policy_denied";
      expertId: string;
      reason: string;
      capability?: string;
      ruleId?: string;
    }
  | {
      kind: "approval_required";
      expertId: string;
      capability: string;
      approver: string;
      prompt: string;
      destructiveOp?: string;
      target?: string;
    };

export class InvokeExpertParseError extends Error {
  readonly raw: unknown;
  constructor(message: string, raw: unknown) {
    super(message);
    this.name = "InvokeExpertParseError";
    this.raw = raw;
  }
}

export type McpCallable = {
  host: {
    mcp: {
      callTool: (
        server: string,
        tool: string,
        input?: Record<string, unknown>,
      ) => Promise<unknown>;
    };
  };
};

export const ATTEST_MCP_SERVER = "attest";

/**
 * Call `attest.invoke_expert` and normalize the response into one of the
 * three outcomes. Throws `InvokeExpertParseError` on an unknown shape so
 * the caller can surface a structured error rather than reinterpret.
 */
export async function callInvokeExpert(
  ctx: McpCallable,
  input: InvokeExpertInput,
): Promise<InvokeExpertOutcome> {
  const raw = await ctx.host.mcp.callTool(ATTEST_MCP_SERVER, "invoke_expert", {
    expertId: input.expertId,
    taskId: input.taskId,
    phase: input.phase,
    prompt: input.prompt,
    input: input.input,
    approvalId: input.approvalId,
  });
  return parseInvokeExpertResult(raw, input.expertId);
}

/**
 * Call `attest.pre_dispatch_check` — the policy preview tool.
 * Returns `{ decision, reason?, capability? }` identical in shape to the
 * policy engine's own `evaluate_policy` output, surfaced as its own MCP
 * tool so the Ralph loop can preview without paying dispatch cost.
 */
export type PreDispatchDecision = {
  decision: "allow" | "deny" | "requires-approval";
  reason?: string;
  capability?: string;
  ruleId?: string;
};

export async function callPreDispatchCheck(
  ctx: McpCallable,
  input: {
    expertId: string;
    taskId: string;
    phase?: string;
    scope?: Record<string, unknown>;
  },
): Promise<PreDispatchDecision> {
  const raw = await ctx.host.mcp.callTool(ATTEST_MCP_SERVER, "pre_dispatch_check", {
    expertId: input.expertId,
    taskId: input.taskId,
    phase: input.phase,
    scope: input.scope,
  });
  return parsePreDispatchResult(raw);
}

/** Unwrap an MCP SDK `{ content: [{ text: "<json>" }] }` envelope if present. */
export function unwrapMcpPayload(raw: unknown): unknown {
  if (raw && typeof raw === "object" && "content" in raw) {
    const content = (raw as { content?: unknown }).content;
    if (Array.isArray(content) && content.length > 0 && typeof content[0] === "object") {
      const first = content[0] as { text?: string };
      if (typeof first.text === "string") {
        try {
          return JSON.parse(first.text);
        } catch {
          return first.text;
        }
      }
    }
  }
  return raw;
}

export function parseInvokeExpertResult(raw: unknown, expertId: string): InvokeExpertOutcome {
  const payload = unwrapMcpPayload(raw);
  if (!payload || typeof payload !== "object") {
    throw new InvokeExpertParseError(
      "invoke_expert returned non-object payload",
      raw,
    );
  }
  const obj = payload as Record<string, unknown>;
  const kind = typeof obj.kind === "string" ? obj.kind : undefined;
  switch (kind) {
    case "expert_output":
    case "ExpertOutput": {
      const result = (obj.result ?? obj) as Record<string, unknown>;
      const summary = typeof obj.summary === "string"
        ? obj.summary
        : typeof result.summary === "string"
        ? result.summary
        : `expert ${expertId} returned without an explicit summary`;
      return { kind: "expert_output", expertId, summary, result };
    }
    case "policy_denied":
    case "PolicyDenied": {
      const reason = typeof obj.reason === "string" ? obj.reason : "policy denied";
      const capability = typeof obj.capability === "string" ? obj.capability : undefined;
      const ruleId = typeof obj.ruleId === "string" ? obj.ruleId : undefined;
      return { kind: "policy_denied", expertId, reason, capability, ruleId };
    }
    case "approval_required":
    case "ApprovalRequired": {
      const capability = typeof obj.capability === "string" ? obj.capability : "unknown";
      const approver = typeof obj.approver === "string" ? obj.approver : "human";
      const prompt = typeof obj.prompt === "string"
        ? obj.prompt
        : `expert ${expertId} needs approval for ${capability}`;
      const destructiveOp = typeof obj.destructiveOp === "string" ? obj.destructiveOp : undefined;
      const target = typeof obj.target === "string" ? obj.target : undefined;
      return {
        kind: "approval_required",
        expertId,
        capability,
        approver,
        prompt,
        destructiveOp,
        target,
      };
    }
    default:
      throw new InvokeExpertParseError(
        `invoke_expert returned unknown kind "${kind ?? "<missing>"}"`,
        raw,
      );
  }
}

export function parsePreDispatchResult(raw: unknown): PreDispatchDecision {
  const payload = unwrapMcpPayload(raw);
  if (!payload || typeof payload !== "object") {
    throw new InvokeExpertParseError(
      "pre_dispatch_check returned non-object payload",
      raw,
    );
  }
  const obj = payload as Record<string, unknown>;
  const decision = typeof obj.decision === "string" ? obj.decision : undefined;
  if (decision !== "allow" && decision !== "deny" && decision !== "requires-approval") {
    throw new InvokeExpertParseError(
      `pre_dispatch_check returned unknown decision "${decision ?? "<missing>"}"`,
      raw,
    );
  }
  return {
    decision,
    reason: typeof obj.reason === "string" ? obj.reason : undefined,
    capability: typeof obj.capability === "string" ? obj.capability : undefined,
    ruleId: typeof obj.ruleId === "string" ? obj.ruleId : undefined,
  };
}
