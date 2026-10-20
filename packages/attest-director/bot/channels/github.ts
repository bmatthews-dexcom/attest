import {
  defaultGitHubAuth,
  githubChannel,
} from "@cursor/bdk/channels/github";
import {
  extractApprovalId,
  parseApprovalReply,
} from "../lib/approvals.js";

/**
 * Optional GitHub channel — the second HITL transport for Director's
 * ask-each approvals when the editor-side MCP elicitation isn't available.
 *
 * Three comment surfaces:
 *
 *  1. `/director <subcommand>` — same slash family as the chat channel.
 *     Routes through the same tool palette, but the originating PR/issue
 *     is captured in the task so `request_approval` can post back here.
 *  2. `/approve [<approvalId>] [<note>…]` — resolve the oldest pending
 *     approval on this issue (explicit id disambiguates when several
 *     are open).
 *  3. `/deny` — same shape, denies instead.
 *
 * Only wired when the deployment supplies GitHub credentials. Mirrors
 * `attest-conductor` (`packages/attest-conductor/bot/channels/github.ts`)
 * so Director reads the same comment format the chief writes.
 */
export default githubChannel({
  botName: "attest-director",
  continuation: "github.none/v2",
  credentials: {
    webhookSecret: { secretName: "GITHUB_WEBHOOK_SECRET" },
    appId: { secretName: "GITHUB_APP_ID" },
    privateKey: { secretName: "GITHUB_APP_PRIVATE_KEY" },
  },
  onComment: (ctx, comment) => {
    const body = comment.body?.trim() ?? "";
    const reply = parseApprovalReply(body);
    if (reply) {
      // Resolve asynchronously via the sibling MCP; the server owns the
      // approval ledger kv namespace.
      return {
        task: async () => {
          const { approvalId: embedded } = extractApprovalId(body);
          const approvalId = reply.approvalId ?? embedded;
          if (!approvalId) {
            // No id present and no in-flight ask found on this issue — ack
            // politely but do nothing. The GitHub approval index lookup is
            // owned by the sibling conductor's channel; Director just
            // handles the id-known case for Director-posted asks.
            return;
          }
          await ctx.host.mcp.callTool("attest-director-mcp", "request_approval", {
            // Dummy taskId — the resolution path reads the stored record.
            taskId: "github-reply",
            capability: "resolve:github-reply",
            prompt: `resolve ${approvalId} with verb=${reply.verb}`,
          });
        },
      };
    }
    // Slash-command handling is delegated to the editor channel for now;
    // GitHub-triggered `/director <subcommand>` kicks off a model turn with
    // the raw body.
    if (body.startsWith("/director")) {
      return {
        auth: defaultGitHubAuth(ctx),
        message: body,
      };
    }
    return null;
  },
});
