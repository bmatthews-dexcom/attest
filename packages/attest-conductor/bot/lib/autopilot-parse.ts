/**
 * Parse `/autopilot` chat/GitHub commands and extract any inline
 * autonomy-mode directive.
 *
 * Chat shape (CLI-flag style):
 *   /autopilot --autonomy approve-each harden the login flow
 *   /autopilot harden the login flow --autonomy approve-destructive
 *
 * GitHub comment shape (bracket directive):
 *   /autopilot harden the login flow [autonomy: approve-each]
 *   /autopilot [autonomy: approve-destructive] harden the login flow
 *
 * Both are accepted on either entry point so the Ralph loop sees a stable
 * `{ goal, autonomyMode? }` tuple regardless of surface. Multi-line
 * bodies (GitHub issues often paste the goal below the slash command)
 * are supported — only the slash line is parsed.
 */

import {
  isAutonomyMode,
  type AutonomyMode,
} from "./autonomy.js";

export type AutopilotCommand = {
  goal: string;
  autonomyMode?: AutonomyMode;
};

export function parseAutopilotCommand(bodyRaw: string | undefined | null): AutopilotCommand | null {
  if (!bodyRaw) return null;
  const body = bodyRaw.trim();
  if (!/^\/autopilot(\b|$)/i.test(body)) return null;

  // Strip the leading slash command, keep the first logical line + any
  // paragraph that comes after it joined with a space so the goal can
  // wrap across lines in a GitHub issue body.
  const lines = body.split(/\r?\n/);
  const firstLine = lines[0] ?? "";
  const trailing = lines.slice(1).join(" ").trim();
  const combined = trailing ? `${firstLine} ${trailing}` : firstLine;

  // Drop the `/autopilot` token itself.
  let rest = combined.replace(/^\/autopilot\b/i, "").trim();

  let autonomyMode: AutonomyMode | undefined;

  // 1) GitHub-style `[autonomy: approve-each]`
  const bracketRe = /\[autonomy\s*:\s*([a-z-]+)\]/i;
  const bracketMatch = bracketRe.exec(rest);
  if (bracketMatch) {
    const candidate = bracketMatch[1].toLowerCase();
    if (isAutonomyMode(candidate)) {
      autonomyMode = candidate;
    }
    rest = rest.replace(bracketRe, " ").trim();
  }

  // 2) CLI-flag-style `--autonomy approve-each` or `--autonomy=approve-each`
  const flagRe = /(?:^|\s)--autonomy(?:=|\s+)([a-z-]+)\b/i;
  const flagMatch = flagRe.exec(rest);
  if (flagMatch) {
    const candidate = flagMatch[1].toLowerCase();
    if (isAutonomyMode(candidate) && !autonomyMode) {
      autonomyMode = candidate;
    }
    rest = rest.replace(flagRe, " ").trim();
  }

  const goal = rest.replace(/\s+/g, " ").trim();
  if (!goal) return null;
  const result: AutopilotCommand = { goal };
  if (autonomyMode) result.autonomyMode = autonomyMode;
  return result;
}
