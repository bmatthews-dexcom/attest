/**
 * Shared approval primitives. Mirrors `attest-conductor`'s approval ledger
 * so both chiefs and the Director speak one wire format.
 *
 * The Director agent calls out to its MCP server for `request_approval` —
 * this file is for client-side resolve-on-reply (parse `/approve`,
 * `/deny` from a GitHub comment).
 */

export type ApprovalStatus = "pending" | "approved" | "denied" | "timeout";

export interface ApprovalRecord {
  approvalId: string;
  taskId: string;
  capability: string;
  prompt: string;
  destructiveOp?: string;
  target?: string;
  status: ApprovalStatus;
  transport: "mcp" | "github" | "none";
  requestedAtMs: number;
  deadlineMs: number;
  resolvedAtMs?: number;
  by?: string;
  reason?: string;
}

export interface ApprovalReply {
  verb: "approve" | "deny";
  approvalId?: string;
  note?: string;
}

const REPLY_RE =
  /^\s*\/(?<verb>approve|deny)\b(?:\s+(?<id>approval_[A-Za-z0-9_-]+))?(?:\s+(?<note>.+))?\s*$/i;

export function parseApprovalReply(body: string | undefined | null): ApprovalReply | null {
  if (!body) return null;
  const firstLine = body.split(/\r?\n/).find((line) => line.trim().length > 0);
  if (!firstLine) return null;
  const match = REPLY_RE.exec(firstLine);
  if (!match || !match.groups) return null;
  const verbRaw = match.groups.verb;
  if (!verbRaw) return null;
  const reply: ApprovalReply = { verb: verbRaw.toLowerCase() as "approve" | "deny" };
  if (match.groups.id) reply.approvalId = match.groups.id;
  if (match.groups.note && match.groups.note.trim()) reply.note = match.groups.note.trim();
  return reply;
}

export const APPROVAL_MARKER_RE =
  /<!--\s*attest-director:approval\s+id="(?<id>[A-Za-z0-9_-]+)"(?:\s+task="(?<task>[A-Za-z0-9_-]+)")?\s*-->/i;

export function extractApprovalId(commentBody: string | undefined | null): {
  approvalId?: string;
  taskId?: string;
} {
  if (!commentBody) return {};
  const match = APPROVAL_MARKER_RE.exec(commentBody);
  if (!match || !match.groups) return {};
  const out: { approvalId?: string; taskId?: string } = {};
  if (match.groups.id) out.approvalId = match.groups.id;
  if (match.groups.task) out.taskId = match.groups.task;
  return out;
}
