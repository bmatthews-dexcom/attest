/**
 * Form-factor decision tree — Phase 3 picker.
 *
 * See `docs/attest-director-architecture.md` §5.1 for the ordered tree.
 * First rule to match wins; default is `in-process-handler` (Shape-C
 * default).
 */
import type { CapabilityMap } from "../schema/capabilities.js";
import type { FormFactor, FormFactorDecision } from "../schema/draft.js";
import { isDestructiveShell } from "../schema/capabilities.js";

export interface PickFormFactorInput {
  capabilities: CapabilityMap;
  /** Hint from the role brief — "auto" lets the tree pick freely. */
  preference?: FormFactor | "auto";
  /** "advisory, interactive, editor-only" roles are the only skill picks. */
  advisoryEditorOnly?: boolean;
  /** True when the handler expects a large context stream that could
   *  starve attest-mcp's event loop if left in-process. */
  longRunningStreaming?: boolean;
}

export interface PickFormFactorResult {
  decision: FormFactorDecision;
}

export function pickFormFactor(input: PickFormFactorInput): PickFormFactorResult {
  const prefer = input.preference ?? "auto";
  const alternatives: FormFactorDecision["alternatives"] = [];

  if (prefer !== "auto") {
    return {
      decision: {
        pick: prefer,
        rationale: `role brief explicitly requested '${prefer}'`,
        ruleFired: "preference",
        alternatives: [],
      },
    };
  }

  const caps = input.capabilities;
  const writesSource = caps.writes.some(nonDocsWrite);
  const destructiveShell = caps.shell_patterns.some(isDestructiveShell);
  const needsGitWrite = caps.shell_patterns.some((p) => /\bgit\s+(push|commit|merge)/i.test(p));
  const needsPr = caps.shell_patterns.some((p) => /\bgh\s+pr\b|\bpr\b/i.test(p));
  const needsPublish = caps.shell_patterns.some((p) => /\bnpm\s+publish\b/i.test(p));

  // Rule 1 — writes:src, shell:destructive, git:write, pr:*, publish:* → sandbox
  if (writesSource || destructiveShell || needsGitWrite || needsPr || needsPublish) {
    alternatives.push(
      { formFactor: "in-process-handler", reasonNotPicked: "cannot host writes outside chief pod's declared scope" },
      { formFactor: "skill", reasonNotPicked: "skill cannot execute writes" },
    );
    return {
      decision: {
        pick: "sandbox-bdk-agent",
        rationale: "role requires writes to source / destructive shell / git / pr / publish — sandbox-required by §5.1 rule 1",
        ruleFired: "rule-1",
        alternatives,
      },
    };
  }

  // Rule 2 — structured zod I/O + shell:safe + MCP tool palette + reproducible logic
  const docsWrite = caps.writes.some(docsOnlyWrite);
  const hasMcpTools = caps.mcp_tools.length > 0;
  const safeShellOnly = caps.shell_patterns.length === 0 || caps.shell_patterns.every((p) => !isDestructiveShell(p));
  if (docsWrite && hasMcpTools && safeShellOnly && !input.longRunningStreaming) {
    alternatives.push(
      { formFactor: "sandbox-bdk-agent", reasonNotPicked: "overkill — bounded blast + no source writes" },
      { formFactor: "skill", reasonNotPicked: "skill cannot call MCP tools reliably" },
    );
    return {
      decision: {
        pick: "in-process-handler",
        rationale: "docs-only write + MCP tool palette + safe shell — matches §5.1 rule 2 (bounded blast)",
        ruleFired: "rule-2",
        alternatives,
      },
    };
  }

  // Rule 3 — read:fs + net:fetch + advisory prompt-only
  const onlyReadsAndFetch =
    caps.writes.length === 0 &&
    caps.shell_patterns.length === 0 &&
    (caps.reads.length > 0 || caps.network.length > 0);
  if (onlyReadsAndFetch && input.advisoryEditorOnly) {
    alternatives.push(
      { formFactor: "in-process-handler", reasonNotPicked: "advisory + editor-only — tool-wrapping overspecifies" },
      { formFactor: "sandbox-bdk-agent", reasonNotPicked: "absurd for prompt-only" },
    );
    return {
      decision: {
        pick: "skill",
        rationale: "read-only + advisory + editor-only — §5.1 rule 3",
        ruleFired: "rule-3",
        alternatives,
      },
    };
  }

  // Rule 4 — long-running analysis without write:src → in-process w/ context budget
  if (input.longRunningStreaming && !writesSource) {
    alternatives.push(
      { formFactor: "sandbox-bdk-agent", reasonNotPicked: "VM cold-start cost not justified; promote later if handler starves attest-mcp" },
      { formFactor: "skill", reasonNotPicked: "skill blows the editor's context budget" },
    );
    return {
      decision: {
        pick: "in-process-handler",
        rationale: "long-running analysis + no source writes — in-process with explicit context budget (§5.1 rule 4)",
        ruleFired: "rule-4",
        alternatives,
      },
    };
  }

  // Default — in-process handler (Shape-C default)
  alternatives.push(
    { formFactor: "sandbox-bdk-agent", reasonNotPicked: "no writes, no destructive ops — sandbox adds cost without benefit" },
    { formFactor: "skill", reasonNotPicked: "needs tool invocation, not pure advice" },
  );
  return {
    decision: {
      pick: "in-process-handler",
      rationale: "no sandbox-forcing capability and not an advisory-editor-only role — Shape-C default (§5.1 default)",
      ruleFired: "default",
      alternatives,
    },
  };
}

function nonDocsWrite(path: string): boolean {
  if (!path) return false;
  if (path === "docs/**" || path === "docs/" || path === "docs") return false;
  if (path.startsWith("docs/")) return false;
  return true;
}

function docsOnlyWrite(path: string): boolean {
  return path.startsWith("docs/") || path === "docs/**" || path === "docs";
}
