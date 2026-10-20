import { fenceFor } from "./fences.js";
function evaluatePolicy(input) {
  const fence = fenceFor(input.capability);
  if (!fence) {
    return {
      decision: "deny",
      capability: input.capability,
      ruleId: "default-deny",
      reason: `no fence declared for capability '${input.capability}' \u2014 default-deny per Yegge discipline`
    };
  }
  switch (fence.tier) {
    case "never":
      return {
        decision: "deny",
        capability: input.capability,
        ruleId: `forbid:${fence.capability}`,
        reason: fence.rationale,
        tier: "never"
      };
    case "always-granted":
      return {
        decision: "allow",
        capability: input.capability,
        ruleId: `permit:${fence.capability}`,
        reason: fence.rationale,
        tier: "always-granted"
      };
    case "ask-each": {
      if (input.context?.approvalGranted === true) {
        return {
          decision: "allow",
          capability: input.capability,
          ruleId: `permit-with-approval:${fence.capability}`,
          reason: `${fence.rationale} (approval ack present)`,
          tier: "ask-each"
        };
      }
      return {
        decision: "requires-approval",
        capability: input.capability,
        ruleId: `ask-each:${fence.capability}`,
        reason: `${fence.rationale} \u2014 fail-closed on decline / timeout`,
        tier: "ask-each"
      };
    }
  }
}
function evaluateShellPolicy(input) {
  const cmd = (input.command ?? "").trim().toLowerCase();
  const argStr = (input.args ?? []).join(" ").toLowerCase();
  const full = (cmd + " " + argStr).trim();
  if (isDestructiveShellString(full)) {
    return evaluatePolicy({
      capability: "shell:destructive",
      context: input.context,
      resource: { target: full }
    });
  }
  if (full.includes("npm install -g")) {
    return evaluatePolicy({
      capability: "install:npm-package-globally",
      context: input.context,
      resource: { target: full }
    });
  }
  if (cmd === "npm" && (argStr.startsWith("publish") || argStr.includes(" publish "))) {
    return evaluatePolicy({
      capability: "publish:npm",
      context: input.context,
      resource: { target: full }
    });
  }
  if (cmd === "npm" && argStr.includes("install") && argStr.includes("--dry-run")) {
    return evaluatePolicy({
      capability: "shell:safe",
      context: input.context,
      resource: { target: full }
    });
  }
  if (SAFE_SHELL_ALLOWLIST.includes(cmd)) {
    return evaluatePolicy({
      capability: "shell:safe",
      context: input.context,
      resource: { target: full }
    });
  }
  return {
    decision: "deny",
    capability: `shell:unknown`,
    ruleId: "default-deny-shell",
    reason: `shell command '${cmd}' not on the Director safe allowlist`
  };
}
function evaluateWritePolicy(input) {
  const path = normalizePath(input.path);
  if (path.includes(".env") || /\.key$|id_rsa/.test(path)) {
    return evaluatePolicy({
      capability: "write:credentials",
      context: input.context,
      resource: { path }
    });
  }
  if (path.endsWith(".cursor/mcp.json") || path.includes("/.cursor/mcp.json")) {
    return evaluatePolicy({
      capability: "edit:.cursor/mcp.json",
      context: input.context,
      resource: { path }
    });
  }
  if (path.startsWith(".cursor/skills/director-created/") || path.includes("/.cursor/skills/director-created/")) {
    return evaluatePolicy({
      capability: "write:workspace:cursor-skills",
      context: input.context,
      resource: { path }
    });
  }
  if (path.startsWith("experts-private/") || path.includes("/experts-private/")) {
    return evaluatePolicy({
      capability: "write:draft-artifact",
      context: input.context,
      resource: { path }
    });
  }
  if (path.startsWith("packages/attest-experts/experts/")) {
    return evaluatePolicy({
      capability: "pr:open:local-attest-repo",
      context: input.context,
      resource: { path }
    });
  }
  return evaluatePolicy({
    capability: "write:customer-source",
    context: input.context,
    resource: { path }
  });
}
function evaluateMcpPolicy(input) {
  if (input.server === "attest-director" || input.server === "attest-director-mcp") {
    return {
      decision: "allow",
      capability: `mcp:${input.server}:${input.tool}`,
      ruleId: "self-mcp-allow",
      reason: "self-call on director mcp surface"
    };
  }
  if (input.tool === "spawn:subagent" || input.tool === "spawn_subagent") {
    return evaluatePolicy({
      capability: "spawn:subagent",
      context: input.context
    });
  }
  if (input.server === "ceo" || input.server === "attest-ceo" || input.server === "attest-ceo-mcp") {
    if (input.tool.startsWith("write") || input.tool.startsWith("edit") || input.tool.startsWith("set_")) {
      return evaluatePolicy({
        capability: "edit:ceo-namespace",
        context: input.context
      });
    }
    return {
      decision: "allow",
      capability: `mcp:${input.server}:${input.tool}`,
      ruleId: "allow-read-ceo",
      reason: "ceo read allowed (completion polling)"
    };
  }
  if (input.server === "chief" || input.server === "attest-conductor" || input.server === "attest-mcp") {
    if (input.tool.startsWith("write") || input.tool.startsWith("edit") || input.tool.startsWith("set_")) {
      return evaluatePolicy({
        capability: "edit:chief-namespace",
        context: input.context
      });
    }
    return {
      decision: "allow",
      capability: `mcp:${input.server}:${input.tool}`,
      ruleId: "allow-read-chief",
      reason: "chief read allowed (hot-register discovery, list-experts)"
    };
  }
  return {
    decision: "allow",
    capability: `mcp:${input.server}:${input.tool}`,
    ruleId: "allow-generic-mcp",
    reason: "generic MCP call (research / integration)"
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
  "git"
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
  "mkfs"
];
function isDestructiveShellString(cmd) {
  const lower = cmd.toLowerCase();
  return DESTRUCTIVE_SHELL_SUBSTRINGS.some((s) => lower.includes(s));
}
function normalizePath(p) {
  return p.replace(/\\/g, "/");
}
export {
  evaluateMcpPolicy,
  evaluatePolicy,
  evaluateShellPolicy,
  evaluateWritePolicy,
  isDestructiveShellString
};
//# sourceMappingURL=cedar.js.map
