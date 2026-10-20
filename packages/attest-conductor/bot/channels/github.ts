import {
  defaultGitHubAuth,
  githubChannel,
} from "@cursor/bdk/channels/github";

/**
 * GitHub channel for `/autopilot` triggers.
 *
 * Opt-in and minimal — the Phase-2 skeleton proves the loop can be driven
 * by a human in the Cursor playground. Wiring real repos / PRs happens
 * when the sibling attest-mcp server lands and we have a target project to
 * drive.
 *
 * Behavior:
 * - `onComment` dispatches when an issue/PR comment starts with `/autopilot`.
 *   The comment body becomes the model turn's message, so a comment of
 *   `/autopilot start harden the login flow` runs the conductor entry
 *   defined in `bot/instructions.md`.
 * - `onIssue` dispatches on `opened` with a title / body that starts with
 *   `/autopilot`, same shape.
 *
 * Credentials follow the BDK v2 pattern — named deployment secrets only.
 */
export default githubChannel({
  botName: "attest-conductor",
  continuation: "github.none/v2",
  credentials: {
    webhookSecret: { secretName: "GITHUB_WEBHOOK_SECRET" },
    appId: { secretName: "GITHUB_APP_ID" },
    privateKey: { secretName: "GITHUB_APP_PRIVATE_KEY" },
  },
  onComment: (ctx, comment) => {
    const body = comment.body?.trim() ?? "";
    if (!/^\/autopilot(\b|$)/i.test(body)) {
      return null;
    }
    return { auth: defaultGitHubAuth(ctx) };
  },
  onIssue: (ctx, issue) => {
    if (issue.action !== "opened") {
      return null;
    }
    const body = `${issue.title ?? ""}\n${issue.body ?? ""}`.trim();
    if (!/^\/autopilot(\b|$)/im.test(body)) {
      return null;
    }
    return { auth: defaultGitHubAuth(ctx) };
  },
});
