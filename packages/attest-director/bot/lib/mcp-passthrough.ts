/**
 * Pass-through helper for agent-side tools that proxy a sibling-MCP call.
 *
 * The sibling MCP returns a `{ content: [{ type: "text", text }] }` envelope
 * where `text` is a JSON string. We unwrap it to parsed JSON (for logging /
 * agent reasoning) and re-wrap it as a TypeScript-safe tool result the BDK
 * tool framework accepts.
 */
import type { JsonValue } from "@cursor/bdk";

export interface TextToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export function wrapText(payload: unknown, isError = false): TextToolResult {
  return {
    content: [
      {
        type: "text",
        text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2),
      },
    ],
    ...(isError ? { isError: true } : {}),
  };
}

export function unwrapMcp(raw: unknown): unknown {
  if (raw && typeof raw === "object" && "content" in raw) {
    const content = (raw as { content?: unknown }).content;
    if (Array.isArray(content) && content.length > 0 && typeof content[0] === "object") {
      const first = content[0] as { text?: string };
      if (typeof first.text === "string") {
        try {
          return JSON.parse(first.text) as JsonValue;
        } catch {
          return first.text;
        }
      }
    }
  }
  return raw;
}
