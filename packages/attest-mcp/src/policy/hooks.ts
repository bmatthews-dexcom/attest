/**
 * policy/hooks.ts — translate Cursor hook JSON into Shape-C
 * `PolicyContext` and back into the Cursor hook decision JSON.
 *
 * This module is the parity surface the sibling cursor-build-target
 * generator (feat/shape-c-build-target, PR #13) commits to. The
 * `POLICY_TOOL_NAMES` constant in that generator declares:
 *
 *   shell       → evaluate_shell_policy   (beforeShellExecution)
 *   write       → evaluate_write_policy   (preToolUse Write|Edit)
 *   mcp         → evaluate_mcp_policy     (planned beforeMcpInvoke)
 *   fences      → list_fences
 *   approval    → request_approval
 *   invoke      → invoke_expert
 *   preDispatch → pre_dispatch_check
 *
 * The same translation runs behind the MCP tools (`src/server.ts`) and
 * the CLI (`src/cli-policy.ts`) so an editor-side hook invocation gets
 * the same decision as an in-process `tools/call`.
 *
 * ── Cursor hook contract ───────────────────────────────────────────────
 * Input (stdin, from Cursor):
 *   beforeShellExecution → { "command": "<shell string>", ... }
 *   preToolUse Write/Edit → { "tool_input": { "file_path"|"filePath"|"path": "...", "content"?: "..." }, "tool_name"?: "Write"|"Edit", ... }
 *   beforeMcpInvoke      → { "server": "...", "tool": "...", "arguments": {...} } (reserved shape)
 *
 * Output (stdout, to Cursor):
 *   {
 *     "continue": true,
 *     "permission": "allow" | "deny",
 *     "user_message": "...",
 *     "agent_message": "..."
 *   }
 *
 * A non-zero exit from the CLI signals engine error to the hook script;
 * the hook script then applies its own LOG_ONLY / ENFORCE fallback (see
 * `.cursor/hooks/evaluate-*-policy.sh` in the sibling PR).
 */

import type { Capability, CapabilityKind } from "../experts/types.js";
import type {
  PolicyContext,
  PolicyDecision,
  PolicyDecisionKind,
} from "./types.js";
import { getPolicyEngine } from "./engine.js";

export type PolicyKind = "shell" | "write" | "mcp";

const PERMISSION_FOR_DECISION: Record<PolicyDecisionKind, "allow" | "deny"> = {
  allow: "allow",
  deny: "deny",
  // Fail-closed from a hook's point of view: a requireApproval decision
  // from a shell/write hook translates to "deny with reason — go talk to
  // the MCP server's request_approval tool." The hook has no HITL
  // transport of its own; the editor's selected agent (sdlc-lead) is
  // expected to pick the request up and re-dispatch through MCP.
  requireApproval: "deny",
};

export interface CursorHookDecision {
  readonly continue: true;
  readonly permission: "allow" | "deny";
  readonly user_message?: string;
  readonly agent_message?: string;
}

// Destructive shell patterns the Shape-C policy engine wants to classify
// as `shell:destructive`. Everything else is `shell:safe`. The sibling
// block-dangerous.sh hook has its own hard-coded list (ADR-012 defence
// in depth); this classifier picks whichever bucket is right for Cedar.
const DESTRUCTIVE_SHELL_PATTERNS: ReadonlyArray<RegExp> = [
  /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|--recursive\b.*--force|-[a-zA-Z]*f[a-zA-Z]*r)\b/i,
  /\bDROP\s+(TABLE|DATABASE|SCHEMA|INDEX)\b/i,
  /\bTRUNCATE\s+(TABLE\s+)?\S+/i,
  /\bDELETE\s+FROM\s+\S+\s*(?:;|$)(?!.*\bWHERE\b)/i,
  /\bgit\s+push\s+.*--force\b|\bgit\s+push\s+-f\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bnpm\s+(publish|unpublish)\b/i,
  /\bcurl\s+.*\|\s*(bash|sh|zsh)\b|\bwget\s+.*\|\s*(bash|sh|zsh)\b/i,
  /\bchmod\s+-R\s+777\b/i,
  /\bmkfs(\.|$)/i,
  /\bdd\s+if=.*of=\/dev\/\w+/i,
  /\bshutdown\b|\breboot\b|\bhalt\b|\bpoweroff\b/i,
  /\bkill\s+-9\s+1\b/i,
];

// Write targets that are credential-shaped. The policy engine always
// says deny for these (the write hook translates them to `env:write`).
const CREDENTIAL_PATH_PATTERNS: ReadonlyArray<RegExp> = [
  /(^|\/)\.env(\.|$)/,
  /(^|\/)credentials\.(json|ya?ml)$/i,
  /(^|\/)secrets\.(json|ya?ml)$/i,
  /\.(key|pem|p12|pfx)$/i,
  /(^|\/)(id_rsa|id_ed25519|id_ecdsa|id_dsa)$/,
];

/**
 * Classify a shell `command` string into our capability kind. The
 * caller still needs to decide whether the capability is permitted for
 * the current expert — this function is only the mapper.
 */
export function classifyShellCommand(command: string): CapabilityKind {
  for (const re of DESTRUCTIVE_SHELL_PATTERNS) {
    if (re.test(command)) return "shell:destructive";
  }
  return "shell:safe";
}

/**
 * Classify a write target by file path. Credential-shaped paths map to
 * `env:write`; everything else is `write:fs`.
 */
export function classifyWriteTarget(path: string): CapabilityKind {
  for (const re of CREDENTIAL_PATH_PATTERNS) {
    if (re.test(path)) return "env:write";
  }
  return "write:fs";
}

export interface HookTranslationOptions {
  /** Expert id to attribute the call to. Defaults to "editor-agent". */
  readonly expertId?: string;
  /** Expert cluster. Defaults to "editor". */
  readonly cluster?: string;
  /** SDLC phase id. Defaults to env ATTEST_POLICY_PHASE or "unknown". */
  readonly phase?: string;
  /** Autonomy mode (drives HITL transport selection downstream). */
  readonly autonomyMode?: "interactive" | "auto";
  /** Short-form task id — carried through the audit log. */
  readonly taskId?: string;
}

type UnknownRecord = Record<string, unknown>;

function pickString(obj: UnknownRecord, keys: readonly string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

export interface TranslatedShell {
  readonly kind: "shell";
  readonly command: string;
  readonly capability: Capability;
  readonly context: PolicyContext;
}

export interface TranslatedWrite {
  readonly kind: "write";
  readonly path: string;
  readonly capability: Capability;
  readonly context: PolicyContext;
}

export interface TranslatedMcp {
  readonly kind: "mcp";
  readonly server: string;
  readonly tool: string;
  readonly capability: Capability;
  readonly context: PolicyContext;
}

export type TranslatedHook = TranslatedShell | TranslatedWrite | TranslatedMcp;

/**
 * Translate a Cursor beforeShellExecution hook payload into a
 * `PolicyContext` the engine can evaluate.
 */
export function translateShellHook(
  input: UnknownRecord,
  opts: HookTranslationOptions = {},
): TranslatedShell {
  const command =
    pickString(input, ["command"]) ??
    (() => {
      const toolInput = input.tool_input as UnknownRecord | undefined;
      return toolInput ? pickString(toolInput, ["command", "script"]) : undefined;
    })() ??
    "";
  const kind = classifyShellCommand(command);
  const capability: Capability = { kind, scope: command.slice(0, 120) };
  return {
    kind: "shell",
    command,
    capability,
    context: buildContext("shell", capability, opts),
  };
}

/**
 * Translate a Cursor preToolUse (Write|Edit matcher) payload.
 */
export function translateWriteHook(
  input: UnknownRecord,
  opts: HookTranslationOptions = {},
): TranslatedWrite {
  const toolInput = (input.tool_input as UnknownRecord | undefined) ?? {};
  const path =
    pickString(toolInput, ["file_path", "filePath", "path", "target_file", "targetFile"]) ??
    pickString(input, ["file_path", "filePath", "path"]) ??
    "";
  const kind = classifyWriteTarget(path);
  const capability: Capability = { kind, scope: path };
  return {
    kind: "write",
    path,
    capability,
    context: buildContext("write", capability, opts),
  };
}

/**
 * Translate a (reserved) beforeMcpInvoke payload — Cursor does not
 * currently expose this hook, but the sibling parity contract reserves
 * `evaluate_mcp_policy` so the surface stays stable when it lands.
 */
export function translateMcpHook(
  input: UnknownRecord,
  opts: HookTranslationOptions = {},
): TranslatedMcp {
  const server = pickString(input, ["server", "server_name", "serverName"]) ?? "";
  const tool = pickString(input, ["tool", "tool_name", "toolName"]) ?? "";
  const capability: Capability = { kind: "net:fetch", scope: `${server}.${tool}` };
  return {
    kind: "mcp",
    server,
    tool,
    capability,
    context: buildContext("mcp", capability, opts),
  };
}

function buildContext(
  kind: PolicyKind,
  capability: Capability,
  opts: HookTranslationOptions,
): PolicyContext {
  return {
    expertId: opts.expertId ?? process.env.ATTEST_POLICY_EXPERT_ID ?? "editor-agent",
    cluster: opts.cluster ?? process.env.ATTEST_POLICY_CLUSTER ?? "editor",
    capability,
    phase: opts.phase ?? process.env.ATTEST_POLICY_PHASE ?? "unknown",
    taskId: opts.taskId ?? process.env.ATTEST_POLICY_TASK_ID,
    autonomyMode:
      opts.autonomyMode ??
      ((process.env.ATTEST_AUTONOMY_MODE ?? "interactive") === "auto"
        ? "auto"
        : "interactive"),
    toolName: `evaluate_${kind}_policy`,
  };
}

/**
 * Project a `PolicyDecision` into the Cursor hook decision JSON shape.
 * Honours the engine's `effective` field: in LOG_ONLY / OFF modes the
 * hook still permits the operation (the audit record carries the real
 * decision for forensic review).
 */
export function toCursorHookDecision(
  translated: TranslatedHook,
  decision: PolicyDecision,
): CursorHookDecision {
  const effectivePermission = PERMISSION_FOR_DECISION[decision.effective];
  const descriptor = describeTarget(translated);
  if (effectivePermission === "allow") {
    const note =
      decision.decision === decision.effective
        ? ""
        : ` (policy would ${decision.decision}; mode=${decision.mode} overrode to allow)`;
    return {
      continue: true,
      permission: "allow",
      user_message: `attest Shape-C policy: allow — ${descriptor}${note}`,
      agent_message:
        `attest-mcp.evaluate_${translated.kind}_policy decision=${decision.decision} ` +
        `effective=${decision.effective} mode=${decision.mode} reason="${decision.reason}"`,
    };
  }
  const policyIds =
    decision.determiningPolicies.length > 0
      ? ` policies=${decision.determiningPolicies.join(",")}`
      : "";
  return {
    continue: true,
    permission: "deny",
    user_message:
      `BLOCKED by attest Shape-C policy (${translated.kind}): ${decision.reason}. ` +
      `${descriptor}`,
    agent_message:
      `attest-mcp.evaluate_${translated.kind}_policy denied this ${translated.kind} ` +
      `operation. decision=${decision.decision} reason="${decision.reason}"${policyIds}. ` +
      `If this operation is actually required, call attest-mcp.request_approval ` +
      `with a short written justification instead of retrying the direct hook.`,
  };
}

function describeTarget(translated: TranslatedHook): string {
  switch (translated.kind) {
    case "shell":
      return `shell command (first 120 chars): ${translated.command.slice(0, 120)}`;
    case "write":
      return `write target: ${translated.path}`;
    case "mcp":
      return `mcp call: ${translated.server}.${translated.tool}`;
  }
}

/**
 * Convenience: translate + evaluate in one call. Used by both the MCP
 * tool handlers and the policy CLI.
 */
export function evaluateHookJson(
  kind: PolicyKind,
  input: UnknownRecord,
  opts: HookTranslationOptions = {},
): { translated: TranslatedHook; decision: PolicyDecision; cursor: CursorHookDecision } {
  const translated =
    kind === "shell"
      ? translateShellHook(input, opts)
      : kind === "write"
        ? translateWriteHook(input, opts)
        : translateMcpHook(input, opts);
  const engine = getPolicyEngine();
  const decision = engine.evaluatePolicy(translated.context);
  const cursor = toCursorHookDecision(translated, decision);
  return { translated, decision, cursor };
}
