/**
 * elicitation/approval.ts — HITL approval via MCP elicitation.
 *
 * The policy engine returns `requireApproval` for capabilities a human
 * must authorise (write:fs, publish:npm, pr:open). The dispatcher calls
 * `requestApprovalViaElicitation()` with the surrounding context; if the
 * connected MCP client supports elicitation, the server sends a form
 * elicitation describing the capability + reason and waits for the
 * `accept|decline|cancel` outcome.
 *
 * Fail-closed semantics (per the Rust `ElicitationApprovalHandler`
 * reference in the research notes):
 *   - no elicitation capability on the connected client → `unavailable`
 *   - transport error / exception → `error`
 *   - decline or cancel → `declined`
 *   - accept with `confirm === true` → `allow`
 *   - accept with `confirm === false` or missing → `declined`
 *
 * The attest-conductor Shape-C worker ships the matching `request_approval`
 * MCP tool that routes to this module via the server. The module itself
 * is internal; it's not registered as an MCP tool here.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApprovalRequiredError, Capability } from "../experts/types.js";
import type { PolicyContext } from "../policy/types.js";

export interface ApprovalRequest {
  readonly expertId: string;
  readonly capability: Capability;
  readonly reason: string;
  readonly phase: string;
  readonly autonomyMode: PolicyContext["autonomyMode"];
  readonly toolName: string;
}

export type ApprovalOutcome =
  | { outcome: "accepted"; confirmedBy?: string }
  | { outcome: "declined"; detail?: string }
  | { outcome: "unavailable"; detail: string }
  | { outcome: "error"; detail: string };

export interface ApprovalTransport {
  requestApproval(request: ApprovalRequest): Promise<ApprovalOutcome>;
}

/**
 * Build an elicitation-backed transport from a live McpServer. The server
 * exposes `server.server.elicitInput()`; we also use `getClientCapabilities()`
 * to short-circuit on clients that don't advertise elicitation support.
 */
export function elicitationTransport(server: McpServer): ApprovalTransport {
  return {
    async requestApproval(request: ApprovalRequest): Promise<ApprovalOutcome> {
      const underlying = server.server;
      const caps = underlying.getClientCapabilities?.();
      if (!caps || !("elicitation" in (caps as Record<string, unknown>))) {
        return {
          outcome: "unavailable",
          detail: "connected MCP client does not advertise `elicitation` capability",
        };
      }
      try {
        const result = await underlying.elicitInput({
          mode: "form",
          message: formatMessage(request),
          requestedSchema: {
            type: "object",
            properties: {
              confirm: {
                type: "boolean",
                title: "Confirm",
                description: `Allow ${request.expertId} to exercise ${capabilityLabel(request.capability)}?`,
                default: false,
              },
              note: {
                type: "string",
                title: "Reviewer note",
                description: "Optional note recorded alongside the approval decision.",
              },
            },
            required: ["confirm"],
          },
        });
        if (result.action === "accept") {
          const content = (result.content ?? {}) as { confirm?: unknown; note?: unknown };
          if (content.confirm === true) {
            const note = typeof content.note === "string" && content.note.trim().length > 0 ? content.note.trim() : undefined;
            return { outcome: "accepted", confirmedBy: note };
          }
          return { outcome: "declined", detail: "accept returned without confirm=true" };
        }
        return { outcome: "declined", detail: result.action };
      } catch (err) {
        return { outcome: "error", detail: (err as Error).message };
      }
    },
  };
}

function capabilityLabel(cap: Capability): string {
  return cap.scope ? `${cap.kind} (scope: ${cap.scope})` : cap.kind;
}

function formatMessage(req: ApprovalRequest): string {
  return (
    `attest-mcp approval request\n\n` +
    `Expert:       ${req.expertId}\n` +
    `Capability:   ${capabilityLabel(req.capability)}\n` +
    `Phase:        ${req.phase}\n` +
    `Autonomy:     ${req.autonomyMode}\n` +
    `Tool:         ${req.toolName}\n` +
    `Reason:       ${req.reason}\n\n` +
    `Confirm to allow this capability for this call only.`
  );
}

/**
 * High-level helper used by the dispatcher: run elicitation and translate
 * the outcome into either `null` (approved — proceed) or a structured
 * `ApprovalRequiredError` (block the call with a stable JSON-RPC error
 * payload).
 */
export async function requestApprovalViaElicitation(
  transport: ApprovalTransport,
  request: ApprovalRequest,
): Promise<ApprovalRequiredError | null> {
  const outcome = await transport.requestApproval(request);
  switch (outcome.outcome) {
    case "accepted":
      return null;
    case "declined":
      return {
        kind: "approval_required",
        expertId: request.expertId,
        capability: request.capability,
        reason: request.reason,
        outcome: "declined",
        detail: outcome.detail,
      };
    case "unavailable":
      return {
        kind: "approval_required",
        expertId: request.expertId,
        capability: request.capability,
        reason: request.reason,
        outcome: "unavailable",
        detail: outcome.detail,
      };
    case "error":
      return {
        kind: "approval_required",
        expertId: request.expertId,
        capability: request.capability,
        reason: request.reason,
        outcome: "error",
        detail: outcome.detail,
      };
  }
}
