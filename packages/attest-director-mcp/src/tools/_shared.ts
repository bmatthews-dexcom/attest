/**
 * Shared helpers for the MCP tool wrappers. Keeps the per-domain tool files
 * (lifecycle.ts, phases.ts, policy.ts, …) short and consistent.
 */
import type {
  CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";

export function okJson(payload: unknown): CallToolResult {
  return {
    content: [
      { type: "text", text: JSON.stringify(payload, null, 2) },
    ],
  };
}

export function errJson(message: string, payload?: unknown): CallToolResult {
  return {
    isError: true,
    content: [
      { type: "text", text: JSON.stringify({ error: message, payload }, null, 2) },
    ],
  };
}
