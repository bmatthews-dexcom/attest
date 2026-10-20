import { isDestructiveShell } from "../schema/capabilities.js";
function pickFormFactor(input) {
  const prefer = input.preference ?? "auto";
  const alternatives = [];
  if (prefer !== "auto") {
    return {
      decision: {
        pick: prefer,
        rationale: `role brief explicitly requested '${prefer}'`,
        ruleFired: "preference",
        alternatives: []
      }
    };
  }
  const caps = input.capabilities;
  const writesSource = caps.writes.some(nonDocsWrite);
  const destructiveShell = caps.shell_patterns.some(isDestructiveShell);
  const needsGitWrite = caps.shell_patterns.some((p) => /\bgit\s+(push|commit|merge)/i.test(p));
  const needsPr = caps.shell_patterns.some((p) => /\bgh\s+pr\b|\bpr\b/i.test(p));
  const needsPublish = caps.shell_patterns.some((p) => /\bnpm\s+publish\b/i.test(p));
  if (writesSource || destructiveShell || needsGitWrite || needsPr || needsPublish) {
    alternatives.push(
      { formFactor: "in-process-handler", reasonNotPicked: "cannot host writes outside chief pod's declared scope" },
      { formFactor: "skill", reasonNotPicked: "skill cannot execute writes" }
    );
    return {
      decision: {
        pick: "sandbox-bdk-agent",
        rationale: "role requires writes to source / destructive shell / git / pr / publish \u2014 sandbox-required by \xA75.1 rule 1",
        ruleFired: "rule-1",
        alternatives
      }
    };
  }
  const docsWrite = caps.writes.some(docsOnlyWrite);
  const hasMcpTools = caps.mcp_tools.length > 0;
  const safeShellOnly = caps.shell_patterns.length === 0 || caps.shell_patterns.every((p) => !isDestructiveShell(p));
  if (docsWrite && hasMcpTools && safeShellOnly && !input.longRunningStreaming) {
    alternatives.push(
      { formFactor: "sandbox-bdk-agent", reasonNotPicked: "overkill \u2014 bounded blast + no source writes" },
      { formFactor: "skill", reasonNotPicked: "skill cannot call MCP tools reliably" }
    );
    return {
      decision: {
        pick: "in-process-handler",
        rationale: "docs-only write + MCP tool palette + safe shell \u2014 matches \xA75.1 rule 2 (bounded blast)",
        ruleFired: "rule-2",
        alternatives
      }
    };
  }
  const onlyReadsAndFetch = caps.writes.length === 0 && caps.shell_patterns.length === 0 && (caps.reads.length > 0 || caps.network.length > 0);
  if (onlyReadsAndFetch && input.advisoryEditorOnly) {
    alternatives.push(
      { formFactor: "in-process-handler", reasonNotPicked: "advisory + editor-only \u2014 tool-wrapping overspecifies" },
      { formFactor: "sandbox-bdk-agent", reasonNotPicked: "absurd for prompt-only" }
    );
    return {
      decision: {
        pick: "skill",
        rationale: "read-only + advisory + editor-only \u2014 \xA75.1 rule 3",
        ruleFired: "rule-3",
        alternatives
      }
    };
  }
  if (input.longRunningStreaming && !writesSource) {
    alternatives.push(
      { formFactor: "sandbox-bdk-agent", reasonNotPicked: "VM cold-start cost not justified; promote later if handler starves attest-mcp" },
      { formFactor: "skill", reasonNotPicked: "skill blows the editor's context budget" }
    );
    return {
      decision: {
        pick: "in-process-handler",
        rationale: "long-running analysis + no source writes \u2014 in-process with explicit context budget (\xA75.1 rule 4)",
        ruleFired: "rule-4",
        alternatives
      }
    };
  }
  alternatives.push(
    { formFactor: "sandbox-bdk-agent", reasonNotPicked: "no writes, no destructive ops \u2014 sandbox adds cost without benefit" },
    { formFactor: "skill", reasonNotPicked: "needs tool invocation, not pure advice" }
  );
  return {
    decision: {
      pick: "in-process-handler",
      rationale: "no sandbox-forcing capability and not an advisory-editor-only role \u2014 Shape-C default (\xA75.1 default)",
      ruleFired: "default",
      alternatives
    }
  };
}
function nonDocsWrite(path) {
  if (!path) return false;
  if (path === "docs/**" || path === "docs/" || path === "docs") return false;
  if (path.startsWith("docs/")) return false;
  return true;
}
function docsOnlyWrite(path) {
  return path.startsWith("docs/") || path === "docs/**" || path === "docs";
}
export {
  pickFormFactor
};
//# sourceMappingURL=pick.js.map
