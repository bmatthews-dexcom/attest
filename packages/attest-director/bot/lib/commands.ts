/**
 * Pure parsers for the `/director` family of chat commands.
 *
 * Keeps the chat-channel handler small and the tests exhaustive.
 */

export type DirectorCommand =
  | { kind: "help" }
  | {
      kind: "create";
      role?: string;
      examplePath?: string;
      urgency: "normal" | "urgent";
    }
  | { kind: "status"; targetId?: string }
  | { kind: "approve"; targetId: string }
  | { kind: "deny"; targetId: string; reason?: string }
  | { kind: "sweep"; expertId?: string }
  | { kind: "refine"; expertId: string; reason?: string }
  | {
      kind: "set-autonomy";
      mode: "draft-and-approve";
      autoForRepeatRole?: boolean;
    }
  | { kind: "unknown"; raw: string };

export function parseDirectorCommand(bodyRaw: string): DirectorCommand | null {
  if (!bodyRaw) return null;
  const body = bodyRaw.trim();
  if (!body.startsWith("/director")) return null;
  const after = body.slice("/director".length).trim();
  if (after.length === 0) return { kind: "help" };

  const [verbRaw, ...rest] = after.split(/\s+/);
  const verb = (verbRaw ?? "").toLowerCase();

  switch (verb) {
    case "status": {
      const status: DirectorCommand = { kind: "status" };
      if (rest[0]) status.targetId = rest[0];
      return status;
    }
    case "approve":
      if (!rest[0]) return { kind: "unknown", raw: body };
      return { kind: "approve", targetId: rest[0] };
    case "deny": {
      if (!rest[0]) return { kind: "unknown", raw: body };
      const reason = extractReason(rest.slice(1).join(" "));
      const deny: DirectorCommand = { kind: "deny", targetId: rest[0] };
      if (reason) deny.reason = reason;
      return deny;
    }
    case "sweep": {
      const sweep: DirectorCommand = { kind: "sweep" };
      if (rest[0]) sweep.expertId = rest[0];
      return sweep;
    }
    case "refine": {
      if (!rest[0]) return { kind: "unknown", raw: body };
      const reason = extractReason(rest.slice(1).join(" "));
      const refine: DirectorCommand = { kind: "refine", expertId: rest[0] };
      if (reason) refine.reason = reason;
      return refine;
    }
    case "create":
      return parseCreate(rest.join(" "));
    case "set-autonomy":
      return parseSetAutonomy(rest.join(" "));
    default:
      return { kind: "unknown", raw: body };
  }
}

function parseCreate(args: string): DirectorCommand {
  if (!args) return { kind: "create", urgency: "normal" };
  const exampleMatch = /--example\s+(\S+)/.exec(args);
  const examplePath = exampleMatch?.[1];
  const urgency: "normal" | "urgent" = /(?:^|\s)--urgency\s+urgent(?:\s|$)/.test(args)
    ? "urgent"
    : "normal";
  const roleMatch = args.match(/^(?!--)(\S+)/);
  const role = roleMatch?.[1];
  const out: DirectorCommand = { kind: "create", urgency };
  if (role) out.role = role;
  if (examplePath) out.examplePath = examplePath;
  return out;
}

function parseSetAutonomy(args: string): DirectorCommand {
  const mode = /\b(draft-and-approve)\b/i.exec(args)?.[1]?.toLowerCase() as
    | "draft-and-approve"
    | undefined;
  if (!mode) return { kind: "unknown", raw: `/director set-autonomy ${args}` };
  const autoMatch = /\bauto-for-repeat-role=(true|false)\b/i.exec(args);
  const out: DirectorCommand = { kind: "set-autonomy", mode };
  if (autoMatch) out.autoForRepeatRole = autoMatch[1]!.toLowerCase() === "true";
  return out;
}

function extractReason(input: string): string | undefined {
  const match = /--reason\s+"([^"]+)"|--reason\s+(\S+)/.exec(input);
  return match?.[1] ?? match?.[2];
}
