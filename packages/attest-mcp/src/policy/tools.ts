/**
 * policy/tools.ts — register the Shape-C parity-contract MCP tools
 * declared by the sibling cursor-build-target generator
 * (`POLICY_TOOL_NAMES` constant in
 * origin/feat/shape-c-build-target:scripts/build-target-cursor.mjs,
 * PR #13):
 *
 *   evaluate_shell_policy  — beforeShellExecution hook → attest-mcp.
 *   evaluate_write_policy  — preToolUse Write|Edit hook → attest-mcp.
 *   evaluate_mcp_policy    — reserved mirror for a future beforeMcpInvoke
 *                            hook; the Cursor hook does not currently
 *                            exist, but the tool is wired so the parity
 *                            check in the generator stays satisfied.
 *   list_fences            — sdlc-lead's "orient" step; reports every
 *                            policy fence currently loaded + the
 *                            handlers that depend on each capability.
 *   request_approval       — exposes the MCP elicitation HITL path as a
 *                            first-class tool (the conductor and
 *                            editor-side chief both call it directly
 *                            instead of relying on a dispatch-time
 *                            `requireApproval` ping-pong).
 *   pre_dispatch_check     — cheap policy-only preview: runs the Cedar
 *                            engine without actually dispatching the
 *                            handler. Returns the same discriminated
 *                            union shape as `invoke_expert` so the
 *                            conductor's parse path reuses one adapter.
 *
 * `invoke_expert` is already registered by
 * `registerInvokeExpertTools` in `src/server.ts`; this module registers
 * the remaining six.
 *
 * No code in this module imports from `src/server.ts` to avoid a cycle.
 * The server wires it in via `registerPolicyTools(server, ...)` after
 * the main tool pass.
 */

import { z } from "zod";
import {
  type McpServer,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Capability, CapabilityKind } from "../experts/types.js";
import { isCapabilityKind } from "../experts/types.js";
import type {
  AutonomyMode,
  PolicyContext,
  PolicyDecision,
} from "./types.js";
import { getPolicyEngine } from "./engine.js";
import { resolveAuditPath } from "./audit.js";
import {
  evaluateHookJson,
  type CursorHookDecision,
  type HookTranslationOptions,
  type PolicyKind,
} from "./hooks.js";
import {
  describeAllHandlers,
  dispatchInProcess,
  type DispatcherOptions,
  toolNameForHandler,
} from "../experts/dispatcher.js";
import {
  getInProcessHandler,
  listInProcessHandlers,
} from "../experts/registry-handlers.js";
import {
  requestApprovalViaElicitation,
  type ApprovalRequest,
  type ApprovalTransport,
} from "../elicitation/approval.js";

const jsonText = (value: unknown): string => JSON.stringify(value, null, 2);

function okContent(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: jsonText(payload) }],
  };
}

function errContent(message: string, extra: Record<string, unknown> = {}) {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: jsonText({ ok: false, error: message, ...extra }),
      },
    ],
  };
}

// ── evaluate_<kind>_policy tools ──────────────────────────────────────

type HookInputShape = {
  input: Record<string, unknown>;
  expert_id?: string;
  cluster?: string;
  phase?: string;
  task_id?: string;
  autonomy_mode?: AutonomyMode;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const policyHookInputSchema: any = {
  input: z
    .record(z.string(), z.unknown())
    .describe(
      "Raw Cursor hook JSON. For evaluate_shell_policy, keys include `command`. For evaluate_write_policy, `tool_input.file_path` (or `.filePath` / `.path`). For evaluate_mcp_policy, `server` and `tool`.",
    ),
  expert_id: z
    .string()
    .optional()
    .describe(
      "Expert id to attribute the call to. Defaults to the ATTEST_POLICY_EXPERT_ID env var or 'editor-agent'.",
    ),
  cluster: z.string().optional().describe("Expert cluster for the policy context."),
  phase: z.string().optional().describe("SDLC phase id (e.g. 'phase-4')."),
  task_id: z.string().optional().describe("Short-form task id — carried through the audit log."),
  autonomy_mode: z
    .enum(["interactive", "auto"])
    .optional()
    .describe("Autonomy mode (drives downstream HITL transport selection)."),
};

function hookOptionsFrom(args: HookInputShape): HookTranslationOptions {
  return {
    expertId: args.expert_id,
    cluster: args.cluster,
    phase: args.phase,
    taskId: args.task_id,
    autonomyMode: args.autonomy_mode,
  };
}

function registerEvaluateHookTool(server: McpServer, kind: PolicyKind): void {
  const toolName = `evaluate_${kind}_policy` as const;
  const title =
    kind === "shell"
      ? "attest Shape-C: evaluate shell command"
      : kind === "write"
        ? "attest Shape-C: evaluate file-mutation"
        : "attest Shape-C: evaluate MCP call (reserved)";
  const description =
    `Policy evaluator for the Cursor ${
      kind === "shell"
        ? "beforeShellExecution"
        : kind === "write"
          ? "preToolUse (Write|Edit matcher)"
          : "beforeMcpInvoke (reserved — Cursor does not currently expose this hook)"
    } hook. Reads the raw hook JSON, classifies the operation against the ` +
    `Shape-C capability taxonomy, runs the Cedar policy engine, and returns ` +
    `(a) the Cedar decision for programmatic consumers and (b) the Cursor-shaped ` +
    `decision JSON ({continue, permission, user_message, agent_message}) for ` +
    `direct hook responses. Honours ATTEST_POLICY_MODE: OFF | LOG_ONLY | ENFORCE.`;
  server.registerTool(
    toolName,
    {
      title,
      description,
      inputSchema: policyHookInputSchema,
    },
    async (args: HookInputShape) => {
      try {
        const { translated, decision, cursor } = evaluateHookJson(
          kind,
          args.input ?? {},
          hookOptionsFrom(args),
        );
        return okContent({
          kind: "policy_decision",
          policyKind: kind,
          cursor,
          decision,
          target: summariseTranslated(translated),
        });
      } catch (err) {
        return errContent((err as Error).message, {
          kind: "policy_error",
          tool: toolName,
        });
      }
    },
  );
}

type TranslatedForSummary =
  | { kind: "shell"; command: string; capability: Capability }
  | { kind: "write"; path: string; capability: Capability }
  | { kind: "mcp"; server: string; tool: string; capability: Capability };

function summariseTranslated(t: TranslatedForSummary): object {
  switch (t.kind) {
    case "shell":
      return { kind: "shell", command: t.command, capability: t.capability };
    case "write":
      return { kind: "write", path: t.path, capability: t.capability };
    case "mcp":
      return { kind: "mcp", server: t.server, tool: t.tool, capability: t.capability };
  }
}

// ── list_fences ────────────────────────────────────────────────────────

function registerListFencesTool(server: McpServer): void {
  server.registerTool(
    "list_fences",
    {
      title: "attest Shape-C: list policy fences",
      description:
        "Enumerate every policy fence currently loaded by the Cedar engine, " +
        "along with the audit-log path, enforcement mode, and the in-process " +
        "handlers that depend on each capability. Consumed by the sdlc-lead " +
        "editor-side chief during its orient step so the agent knows what it " +
        "can and cannot do before planning. Read-only.",
      inputSchema: {},
    },
    () => {
      try {
        const engine = getPolicyEngine();
        const handlers = describeAllHandlers();
        const capabilityIndex: Record<string, string[]> = {};
        for (const h of handlers) {
          for (const cap of h.requiredCapabilities) {
            const key = cap.kind;
            if (!capabilityIndex[key]) capabilityIndex[key] = [];
            capabilityIndex[key].push(h.id);
          }
        }
        return okContent({
          kind: "fences",
          mode: engine.mode,
          cedarVersion: engine.cedarVersion,
          policyIds: engine.policyIds,
          auditLogPath: resolveAuditPath(),
          handlerCount: handlers.length,
          handlers,
          capabilityIndex,
        });
      } catch (err) {
        return errContent((err as Error).message, { kind: "policy_error", tool: "list_fences" });
      }
    },
  );
}

// ── request_approval ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const requestApprovalInputSchema: any = {
  expert_id: z
    .string()
    .describe("Expert id requesting approval (e.g. 'secrets-scanner')."),
  capability_kind: z
    .string()
    .describe(
      "Capability kind the operation requires. One of: read:fs, write:fs, shell:safe, shell:destructive, net:fetch, git:read, git:write, pr:open, pr:merge, publish:npm, env:write.",
    ),
  capability_scope: z
    .string()
    .optional()
    .describe("Optional scope string (e.g. file path or shell command)."),
  reason: z
    .string()
    .describe("Human-readable justification shown to the approver."),
  phase: z.string().optional().describe("Current SDLC phase id."),
  task_id: z.string().optional().describe("Short-form task id — carried through the audit log."),
  autonomy_mode: z
    .enum(["interactive", "auto"])
    .optional()
    .describe("Autonomy mode. Elicitation only works for 'interactive'; 'auto' is reserved for the conductor's GitHub HITL path."),
};

export function registerRequestApprovalTool(
  server: McpServer,
  getTransport: () => ApprovalTransport | undefined,
): void {
  server.registerTool(
    "request_approval",
    {
      title: "attest Shape-C: request HITL approval via MCP elicitation",
      description:
        "Explicit entry point for the HITL approval path. Shape C splits " +
        "HITL between (a) MCP elicitation when the connected client supports " +
        "it (editor-attached runs) and (b) GitHub comment HITL via the " +
        "sibling attest-conductor (hosted runs). This tool owns (a); the " +
        "conductor owns (b). Fails closed with outcome='unavailable' when " +
        "the connected client has not advertised MCP elicitation.",
      inputSchema: requestApprovalInputSchema,
    },
    async (args: {
      expert_id: string;
      capability_kind: string;
      capability_scope?: string;
      reason: string;
      phase?: string;
      task_id?: string;
      autonomy_mode?: AutonomyMode;
    }) => {
      try {
        if (!isCapabilityKind(args.capability_kind)) {
          return errContent(`unknown capability kind: ${args.capability_kind}`, {
            kind: "policy_error",
            tool: "request_approval",
          });
        }
        const kind = args.capability_kind as CapabilityKind;
        const capability: Capability = { kind, scope: args.capability_scope };
        const transport = getTransport();
        if (!transport) {
          return okContent({
            kind: "approval_required",
            error: {
              kind: "approval_required",
              expertId: args.expert_id,
              capability,
              reason: args.reason,
              outcome: "unavailable",
              detail: "no elicitation transport is attached to this server",
            },
          });
        }
        const approvalRequest: ApprovalRequest = {
          expertId: args.expert_id,
          capability,
          reason: args.reason,
          phase: args.phase ?? "unknown",
          autonomyMode: args.autonomy_mode ?? "interactive",
          toolName: "request_approval",
        };
        const failure = await requestApprovalViaElicitation(transport, approvalRequest);
        if (failure) {
          return okContent({
            kind: "approval_required",
            error: failure,
            request: approvalRequest,
          });
        }
        return okContent({
          kind: "expert_output",
          ok: true,
          approved: true,
          request: approvalRequest,
          note: "elicitation accepted; caller may now dispatch the gated operation",
        });
      } catch (err) {
        return errContent((err as Error).message, {
          kind: "policy_error",
          tool: "request_approval",
        });
      }
    },
  );
}

// ── pre_dispatch_check ────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const preDispatchInputSchema: any = {
  expert_id: z.string().describe("Expert id to preview the dispatch for."),
  phase: z.string().optional(),
  task_id: z.string().optional(),
  autonomy_mode: z.enum(["interactive", "auto"]).optional(),
  reason_for_approval: z.string().optional(),
  capabilities: z
    .array(
      z.object({
        kind: z.string(),
        scope: z.string().optional(),
      }),
    )
    .optional()
    .describe(
      "Optional capability-set override. When omitted, the handler's declared requiredCapabilities are used.",
    ),
};

export function registerPreDispatchCheckTool(server: McpServer): void {
  server.registerTool(
    "pre_dispatch_check",
    {
      title: "attest Shape-C: preview a dispatch without invoking the handler",
      description:
        "Policy-only preview. Runs the Cedar engine against the handler's " +
        "required capabilities (or an explicit override) WITHOUT calling " +
        "handler.invoke(). Returns the same `kind` discriminated union as " +
        "`invoke_expert` ('expert_output' | 'policy_denied' | " +
        "'approval_required') so the conductor's parse adapter is " +
        "reusable. 'expert_output' here means 'preview passed, dispatch " +
        "would run' — the output body is empty.",
      inputSchema: preDispatchInputSchema,
    },
    async (args: {
      expert_id: string;
      phase?: string;
      task_id?: string;
      autonomy_mode?: AutonomyMode;
      reason_for_approval?: string;
      capabilities?: Array<{ kind: string; scope?: string }>;
    }) => {
      try {
        const handler = getInProcessHandler(args.expert_id);
        if (!handler) {
          return okContent({
            kind: "policy_denied",
            error: {
              kind: "policy_denied",
              expertId: args.expert_id,
              reason: "unknown_expert",
              detail: "no in-process handler is registered for this expert id",
              registered: listInProcessHandlers().map((h) => h.id),
            },
          });
        }
        const caps: Capability[] =
          args.capabilities && args.capabilities.length > 0
            ? args.capabilities
                .filter((c) => isCapabilityKind(c.kind))
                .map((c) => ({ kind: c.kind as CapabilityKind, scope: c.scope }))
            : [...handler.requiredCapabilities];

        const engine = getPolicyEngine();
        const decisions: PolicyDecision[] = [];
        const autonomyMode: AutonomyMode = args.autonomy_mode ?? "interactive";
        const phase = args.phase ?? "unknown";
        for (const capability of caps) {
          const context: PolicyContext = {
            expertId: handler.id,
            cluster: handler.cluster,
            capability,
            phase,
            taskId: args.task_id,
            autonomyMode,
            toolName: "pre_dispatch_check",
            reason: args.reason_for_approval,
          };
          const decision = engine.evaluatePolicy(context);
          decisions.push(decision);
          if (decision.effective === "deny") {
            return okContent({
              kind: "policy_denied",
              error: {
                kind: "policy_denied",
                expertId: handler.id,
                capability,
                reason: decision.reason,
                determiningPolicies: decision.determiningPolicies,
              },
              decision,
              decisions,
            });
          }
          if (decision.effective === "requireApproval") {
            return okContent({
              kind: "approval_required",
              error: {
                kind: "approval_required",
                expertId: handler.id,
                capability,
                reason: decision.reason,
                outcome: "preview",
                detail:
                  "pre_dispatch_check does not actually elicit approval; call request_approval or invoke_expert when you are ready to proceed",
              },
              decision,
              decisions,
            });
          }
        }
        return okContent({
          kind: "expert_output",
          ok: true,
          output: {
            ok: true,
            expertId: handler.id,
            summary:
              "pre_dispatch_check: all required capabilities permitted; dispatch would run",
            findings: [],
            runtimeMs: 0,
          },
          decisions,
          invocation: {
            tool: toolNameForHandler(handler.id),
            dispatcher: "invoke_expert",
          },
        });
      } catch (err) {
        return errContent((err as Error).message, {
          kind: "policy_error",
          tool: "pre_dispatch_check",
        });
      }
    },
  );
}

// ── public entry point ─────────────────────────────────────────────────

/**
 * Register every Shape-C parity-contract tool except `invoke_expert`
 * (that one is wired in `src/server.ts` next to the per-handler tools).
 */
export function registerPolicyTools(
  server: McpServer,
  options: {
    readonly dispatcherOptions: DispatcherOptions;
    readonly getApprovalTransport: () => ApprovalTransport | undefined;
  },
): void {
  registerEvaluateHookTool(server, "shell");
  registerEvaluateHookTool(server, "write");
  registerEvaluateHookTool(server, "mcp");
  registerListFencesTool(server);
  registerRequestApprovalTool(server, options.getApprovalTransport);
  registerPreDispatchCheckTool(server);
  // dispatcher options kept in the signature so a future tool that
  // actually dispatches (e.g. a "dry-run then dispatch" composite) has a
  // stable injection point.
  void options.dispatcherOptions;
  void dispatchInProcess;
}

/**
 * Flat list of the parity-contract tool names so inventory / tests can
 * assert the whole set is registered. Mirrors
 * `origin/feat/shape-c-build-target:scripts/build-target-cursor.mjs`'s
 * `POLICY_TOOL_NAMES` constant.
 */
export const POLICY_TOOL_NAMES = {
  shell: "evaluate_shell_policy",
  write: "evaluate_write_policy",
  mcp: "evaluate_mcp_policy",
  fences: "list_fences",
  approval: "request_approval",
  invoke: "invoke_expert",
  preDispatch: "pre_dispatch_check",
} as const;
