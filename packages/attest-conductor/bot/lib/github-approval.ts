/**
 * GitHub comment-approve wire format.
 *
 * The chief posts a comment carrying an HTML-comment marker so a reply
 * can be scoped back to a specific pending approval. Comment body shape:
 *
 *   > autopilot needs approval
 *   >
 *   > capability: write:src
 *   > reason: semgrep-fix wants to edit src/auth.ts
 *   >
 *   > Reply with `/approve` or `/deny` (optionally `/approve <approvalId>`
 *   > if you want to be explicit when multiple approvals are pending on
 *   > this issue).
 *   >
 *   10| *   > <!-- attest:approval id="approval_abc" task="task_xyz" -->
 *
 * The HTML comment is stable, machine-readable, and invisible in the
 * rendered PR view — the kind of marker Shape C's design doc §5 lists as
 * a "scope-widening gate receipt."
 *
 * Reply parser accepts (case-insensitive, first-match wins):
 *
 *   /approve                       → approve the oldest pending for this issue
 *   /approve <approvalId>          → approve the named approval
 *   /approve <approvalId> <note…>  → with a free-text note
 *   /deny    (same shapes)
 */

export const APPROVAL_MARKER_RE = /<!--\s*attest:approval\s+id="(?<id>[A-Za-z0-9_-]+)"(?:\s+task="(?<task>[A-Za-z0-9_-]+)")?\s*-->/i;

export function approvalMarker(approvalId: string, taskId: string): string {
  return `<!-- attest:approval id="${approvalId}" task="${taskId}" -->`;
}

export function extractApprovalId(commentBody: string | undefined | null): {
  approvalId?: string;
  taskId?: string;
} {
  if (!commentBody) return {};
  const match = APPROVAL_MARKER_RE.exec(commentBody);
  if (!match || !match.groups) return {};
  return { approvalId: match.groups.id, taskId: match.groups.task };
}

export type ApprovalReply = {
  verb: "approve" | "deny";
  approvalId?: string;
  note?: string;
};

const REPLY_RE = /^\s*\/(?<verb>approve|deny)\b(?:\s+(?<id>approval_[A-Za-z0-9_-]+|cmt-[A-Za-z0-9_-]+))?(?:\s+(?<note>.+))?\s*$/i;

export function parseApprovalReply(body: string | undefined | null): ApprovalReply | null {
  if (!body) return null;
  const firstLine = body.split(/\r?\n/).find((line) => line.trim().length > 0);
  if (!firstLine) return null;
  const match = REPLY_RE.exec(firstLine);
  if (!match || !match.groups) return null;
  const verb = match.groups.verb.toLowerCase() as "approve" | "deny";
  const approvalId = match.groups.id;
  const noteRaw = match.groups.note;
  const reply: ApprovalReply = { verb };
  if (approvalId) reply.approvalId = approvalId;
  if (noteRaw && noteRaw.trim()) reply.note = noteRaw.trim();
  return reply;
}

/**
 * Render the comment body the chief posts to request approval.
 */
export function renderApprovalCommentBody(input: {
  approvalId: string;
  taskId: string;
  capability: string;
  prompt: string;
  destructiveOp?: string;
  target?: string;
  requestedByExpertId?: string;
  timeoutHours?: number;
  autonomyMode: string;
}): string {
  const lines: string[] = [];
  lines.push("**attest autopilot needs approval**");
  lines.push("");
  lines.push(`- **capability**: \`${input.capability}\``);
  if (input.destructiveOp) {
    lines.push(`- **destructive op**: \`${input.destructiveOp}\``);
  }
  if (input.target) {
    lines.push(`- **target**: \`${input.target}\``);
  }
  if (input.requestedByExpertId) {
    lines.push(`- **requested by**: \`${input.requestedByExpertId}\``);
  }
  lines.push(`- **autonomy mode**: \`${input.autonomyMode}\``);
  if (input.timeoutHours) {
    lines.push(`- **auto-denies after**: ${input.timeoutHours}h`);
  }
  lines.push("");
  lines.push(`> ${input.prompt.replace(/\n/g, "\n> ")}`);
  lines.push("");
  lines.push(
    "Reply with `/approve` or `/deny` (optionally `/approve " +
      input.approvalId +
      "` to be explicit when multiple approvals are pending on this issue).",
  );
  lines.push("");
  lines.push(approvalMarker(input.approvalId, input.taskId));
  return lines.join("\n");
}
