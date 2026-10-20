/**
 * Pure policy evaluator — "Cedar bundle, sketch form."
 *
 * The real Shape-C `attest-mcp` instance owns the authoritative Cedar
 * engine. Director's own actions get routed through this smaller evaluator,
 * which keeps the Director's fences self-contained and testable without
 * requiring attest-mcp to be running.
 *
 * Decisions are one of:
 *
 *   - `allow`             — the always-granted tier. No ask required.
 *   - `requires-approval` — the ask-each tier. Caller must `request_approval`
 *                           and only proceed if `approved=true`.
 *   - `deny`              — the `never` tier. Hard refuse; no override.
 *
 * The shape intentionally matches `attest-mcp` so the chief and Director
 * can share the same adapter if we ever federate them.
 */
import { fenceFor, type Fence } from "./fences.js";
import type { AutonomyMode } from "../schema/autonomy.js";

export type PolicyDecisionKind = "allow" | "requires-approval" | "deny";

export interface PolicyDecision {
  decision: PolicyDecisionKind;
  capability: string;
  ruleId: string;
  reason: string;
  tier?: Fence["tier"];
}

export interface EvaluateInput {
  capability: string;
  resource?: {
    /** Normalized resource path for scope-aware fences (e.g. docs/foo.md). */
    path?: string;
    /** Target id (expert id, MCP server id, PR number) for human context. */
    target?: string;
  };
  context?: {
    /** True when this call already carries an approval ack. */
    approvalGranted?: boolean;
    /** Director's current autonomy mode. */
    autonomyMode?: AutonomyMode;
    /** Op classification for narrower reasoning (e.g. "edit:mcp.json"). */
    op?: string;
  };
}

export function evaluatePolicy(input: EvaluateInput): PolicyDecision {
  const fence = fenceFor(input.capability);
  if (!fence) {
    return {
      decision: "deny",
      capability: input.capability,
      ruleId: "default-deny",
      reason: `no fence declared for capability '${input.capability}' — default-deny per Yegge discipline`,
    };
  }

  switch (fence.tier) {
    case "never":
      return {
        decision: "deny",
        capability: input.capability,
        ruleId: `forbid:${fence.capability}`,
        reason: fence.rationale,
        tier: "never",
      };
    case "always-granted":
      return {
        decision: "allow",
        capability: input.capability,
        ruleId: `permit:${fence.capability}`,
        reason: fence.rationale,
        tier: "always-granted",
      };
    case "ask-each": {
      if (input.context?.approvalGranted === true) {
        return {
          decision: "allow",
          capability: input.capability,
          ruleId: `permit-with-approval:${fence.capability}`,
          reason: `${fence.rationale} (approval ack present)`,
          tier: "ask-each",
        };
      }
      return {
        decision: "requires-approval",
        capability: input.capability,
        ruleId: `ask-each:${fence.capability}`,
        reason: `${fence.rationale} — fail-closed on decline / timeout`,
        tier: "ask-each",
      };
    }
  }
}

/** Convenience: Director's shell policy entry point. */
export function evaluateShellPolicy(input: {
  command: string;
  args?: string[];
  context?: EvaluateInput["context"];
}): PolicyDecision {
  const cmd = (input.command ?? "").trim().toLowerCase();
  const argStr = (input.args ?? []).join(" ").toLowerCase();
  const full = (cmd + " " + argStr).trim();

  if (isDestructiveShellString(full)) {
    return evaluatePolicy({
      capability: "shell:destructive",
      context: input.context,
      resource: { target: full },
    });
  }

  if (full.includes("npm install -g")) {
    return evaluatePolicy({
      capability: "install:npm-package-globally",
      context: input.context,
      resource: { target: full },
    });
  }

  if (
    cmd === "npm" &&
    (argStr.startsWith("publish") || argStr.includes(" publish "))
  ) {
    return evaluatePolicy({
      capability: "publish:npm",
      context: input.context,
      resource: { target: full },
    });
  }

  if (cmd === "npm" && argStr.includes("install") && argStr.includes("--dry-run")) {
    return evaluatePolicy({
      capability: "shell:safe",
      context: input.context,
      resource: { target: full },
    });
  }

  if (SAFE_SHELL_ALLOWLIST.includes(cmd)) {
    return evaluatePolicy({
      capability: "shell:safe",
      context: input.context,
      resource: { target: full },
    });
  }

  return {
    decision: "deny",
    capability: `shell:unknown`,
    ruleId: "default-deny-shell",
    reason: `shell command '${cmd}' not on the Director safe allowlist`,
  };
}

/** Convenience: Director's write policy entry point. */
export function evaluateWritePolicy(input: {
  path: string;
  context?: EvaluateInput["context"];
}): PolicyDecision {
  const path = normalizePath(input.path);

  if (path.includes(".env") || /\.key$|id_rsa/.test(path)) {
    return evaluatePolicy({
      capability: "write:credentials",
      context: input.context,
      resource: { path },
    });
  }

  if (path.endsWith(".cursor/mcp.json") || path.includes("/.cursor/mcp.json")) {
    return evaluatePolicy({
      capability: "edit:.cursor/mcp.json",
      context: input.context,
      resource: { path },
    });
  }

  if (path.startsWith(".cursor/skills/director-created/") ||
      path.includes("/.cursor/skills/director-created/")) {
    return evaluatePolicy({
      capability: "write:workspace:cursor-skills",
      context: input.context,
      resource: { path },
    });
  }

  if (path.startsWith("experts-private/") || path.includes("/experts-private/")) {
    return evaluatePolicy({
      capability: "write:draft-artifact",
      context: input.context,
      resource: { path },
    });
  }

  if (path.startsWith("packages/attest-experts/experts/")) {
    // Shared tier — only reachable through promotion flow.
    return evaluatePolicy({
      capability: "pr:open:local-attest-repo",
      context: input.context,
      resource: { path },
    });
  }

  // Any other write to the user's product source is forbidden.
  return evaluatePolicy({
    capability: "write:customer-source",
    context: input.context,
    resource: { path },
  });
}

/** Convenience: Director's MCP policy entry point. */
export function evaluateMcpPolicy(input: {
  server: string;
  tool: string;
  context?: EvaluateInput["context"];
}): PolicyDecision {
  // Director's own MCP server is always allowed to be called by Director.
  if (input.server === "attest-director" || input.server === "attest-director-mcp") {
    return {
      decision: "allow",
      capability: `mcp:${input.server}:${input.tool}`,
      ruleId: "self-mcp-allow",
      reason: "self-call on director mcp surface",
    };
  }

  // Spawning subagents through MCP is ask-each.
  if (input.tool === "spawn:subagent" || input.tool === "spawn_subagent") {
    return evaluatePolicy({
      capability: "spawn:subagent",
      context: input.context,
    });
  }

  // Cross-namespace reads of chief/CEO are forbidden.
  if (input.server === "ceo" || input.server === "attest-ceo" || input.server === "attest-ceo-mcp") {
    if (input.tool.startsWith("write") || input.tool.startsWith("edit") || input.tool.startsWith("set_")) {
      return evaluatePolicy({
        capability: "edit:ceo-namespace",
        context: input.context,
      });
    }
    return {
      decision: "allow",
      capability: `mcp:${input.server}:${input.tool}`,
      ruleId: "allow-read-ceo",
      reason: "ceo read allowed (completion polling)",
    };
  }

  if (input.server === "chief" || input.server === "attest-conductor" || input.server === "attest-mcp") {
    if (input.tool.startsWith("write") || input.tool.startsWith("edit") || input.tool.startsWith("set_")) {
      return evaluatePolicy({
        capability: "edit:chief-namespace",
        context: input.context,
      });
    }
    return {
      decision: "allow",
      capability: `mcp:${input.server}:${input.tool}`,
      ruleId: "allow-read-chief",
      reason: "chief read allowed (hot-register discovery, list-experts)",
    };
  }

  // Everything else — defer to read:web / shell:safe fences if the tool is
  // a known research MCP (atlassian, github, etc.). We allow the call but
  // the tool itself handles its own scopes.
  return {
    decision: "allow",
    capability: `mcp:${input.server}:${input.tool}`,
    ruleId: "allow-generic-mcp",
    reason: "generic MCP call (research / integration)",
  };
}

const SAFE_SHELL_ALLOWLIST = [
  "npm",
  "npx",
  "node",
  "bdk",
  "zod",
  "ajv",
  "jq",
  "grep",
  "rg",
  "cat",
  "ls",
  "head",
  "tail",
  "pwd",
  "echo",
  "date",
  "git",
];

const DESTRUCTIVE_SHELL_SUBSTRINGS = [
  "rm -rf",
  "rm -r",
  "git push --force",
  "git push -f",
  "drop table",
  "curl | bash",
  "wget | bash",
  ":(){:|:&};:",
  "sudo ",
  "chmod 777",
  "mkfs",
];

export function isDestructiveShellString(cmd: string): boolean {
  const lower = cmd.toLowerCase();
  return DESTRUCTIVE_SHELL_SUBSTRINGS.some((s) => lower.includes(s));
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}
