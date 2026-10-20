/**
 * server.ts — build the MCP server surface: tools, resources, prompts.
 *
 * This file wires the pieces; the semantics live in src/validators/,
 * src/phase-gate/, src/routing/, src/protocols/, src/prompts/.
 */

import { readFileSync } from "node:fs";
import { z } from "zod";
import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { attestRoot } from "./sources.js";
import {
  listValidators,
  validatorByToolName,
  ValidatorDescriptor,
} from "./validators/catalog.js";
import { runValidator } from "./validators/run.js";
import {
  phaseGateCheck,
  PhaseGateCheckResult,
} from "./phase-gate/check.js";
import { stateMachineJSON, PHASES } from "./phase-gate/state-machine.js";
import {
  ROUTING_TABLE,
  routeGoal,
  routingTableJSON,
} from "./routing/table.js";
import {
  listProtocols,
  protocolBySlug,
  readProtocol,
} from "./protocols/loader.js";
import {
  listExpertPrompts,
  listSdlcModePrompts,
  readExpertPrompt,
  readSdlcModePrompt,
  expertPromptByName,
  sdlcModePromptByName,
} from "./prompts/registry.js";
import {
  listExperts,
  expertById,
  expertCatalogJSON,
  expertManifestJSON,
  invocationHintForAgent,
} from "./experts/registry.js";

export const SERVER_NAME = "attest";
export const SERVER_VERSION = "0.1.0";

// Shared input schema for every validator tool. Typed as `any` because the
// MCP SDK's registerTool generic unification over 79 identical schemas
// exceeds TypeScript's instantiation ceiling (TS2589) when the same literal
// is passed to each call; the runtime schema is intact and MCP clients see
// the proper zod-derived JSON schema regardless.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const validatorInputSchema: any = {
  projectRoot: z
    .string()
    .optional()
    .describe(
      "Repo to validate. Defaults to $ATTEST_TARGET_ROOT or the server's cwd.",
    ),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Hard cap in milliseconds. Default 120000 (2 minutes)."),
  enableTelemetry: z
    .boolean()
    .optional()
    .describe(
      "Forward EXPERTS_TELEMETRY=1 to the validator so it writes " +
        "docs/work/telemetry.jsonl in the target repo. Default false.",
    ),
};

// Shared schemas for the non-validator tools. Same `any`-escape as above —
// 80+ zod-shape unifications in one buildServer() blows past TS2589
// otherwise. The runtime zod schemas are intact and MCP clients see the
// correct JSON Schema.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const phaseGateInputSchema: any = {
  currentPhase: z
    .string()
    .describe(
      "The phase the project is in now (e.g. phase-3). Use the same phase as `nextPhase` to re-run a gate.",
    ),
  nextPhase: z
    .string()
    .describe(
      "The phase to transition into (e.g. phase-4, phase-5, onboard-deep, security-deep).",
    ),
  projectRoot: z
    .string()
    .optional()
    .describe(
      "Repo to check. Defaults to $ATTEST_TARGET_ROOT or the server's cwd.",
    ),
  runValidators: z
    .boolean()
    .optional()
    .describe(
      "When true, actually invoke each of the target phase's validators. When false (default), only report what WOULD run and the cheap blockers (prereq receipts, required files).",
    ),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const routeGoalInputSchema: any = {
  goal: z
    .string()
    .min(1)
    .describe(
      'The goal in plain English, e.g. "harden this before launch" or "find security issues and fix them".',
    ),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const listExpertsInputSchema: any = {
  cluster: z
    .string()
    .optional()
    .describe(
      "Optional filter by cluster (sdlc, security, code-quality, performance, architecture, api, data, ux, testing, ops, release, research, cost, analytics, integration, orchestration, other).",
    ),
  phase: z
    .string()
    .optional()
    .describe(
      "Optional filter by SDLC phase id (e.g. phase-3). Returns experts whose recommendedPhases contain this value.",
    ),
};

function registerPhaseGateTool(server: McpServer): void {
  server.registerTool(
    "phase_gate_check",
    {
      title: "attest phase-gate check",
      description:
        "Given a current phase and intended next phase, decide whether the " +
        "transition is allowed and what blocks it. Reports missing prereq " +
        "receipts, missing required files, and (optionally) runs the target " +
        "phase's validators. Phases: " +
        PHASES.map((p) => p.id).join(", ") +
        ".",
      inputSchema: phaseGateInputSchema,
    },
    async (args: {
      currentPhase: string;
      nextPhase: string;
      projectRoot?: string;
      runValidators?: boolean;
    }) => {
      try {
        const result: PhaseGateCheckResult = await phaseGateCheck({
          currentPhase: args.currentPhase,
          nextPhase: args.nextPhase,
          projectRoot: args.projectRoot,
          runValidators: args.runValidators,
        });
        return okContent(result);
      } catch (err) {
        return errContent((err as Error).message, { tool: "phase_gate_check" });
      }
    },
  );
}

function registerRouteGoalTool(server: McpServer): void {
  server.registerTool(
    "route_goal",
    {
      title: "attest /guide router",
      description:
        "Given a plain-English goal, return the recommended expert agent, " +
        "its command, a short rationale, and (when the agent is a known " +
        "primary expert) an invocation_hint for spawning the matching " +
        "@bpmforge/attest-experts BDK agent. Mirrors agents/guide.md's " +
        "routing table. For ambiguous goals the response defers to /guide " +
        "rather than guessing.",
      inputSchema: routeGoalInputSchema,
    },
    (args: { goal: string }) => {
      try {
        const match = routeGoal(args.goal);
        return okContent({
          ok: true,
          goal: match.goal,
          match: match.match
            ? {
                agent: match.match.entry.agent,
                command: match.match.entry.command,
                rationale: match.match.entry.rationale,
                matchedPatterns: match.match.matchedPatterns,
                score: match.match.score,
                invocationHint: invocationHintForAgent(match.match.entry.agent),
              }
            : null,
          runnerUp: match.runnerUp
            ? {
                agent: match.runnerUp.entry.agent,
                command: match.runnerUp.entry.command,
                score: match.runnerUp.score,
                invocationHint: invocationHintForAgent(
                  match.runnerUp.entry.agent,
                ),
              }
            : null,
          rationale: match.rationale,
        });
      } catch (err) {
        return errContent((err as Error).message, { tool: "route_goal" });
      }
    },
  );
}

function registerListExpertsTool(server: McpServer): void {
  server.registerTool(
    "list_experts",
    {
      title: "attest primary experts",
      description:
        "List every attest primary expert agent with its cluster, " +
        "invocation hint (for the sibling @bpmforge/attest-experts BDK " +
        "agents), recommended SDLC phases, and required-tool list. The " +
        "same payload is browsable via the attest://experts/catalog " +
        "resource; per-expert manifests (with the full persona) live at " +
        "attest://experts/<id>.",
      inputSchema: listExpertsInputSchema,
    },
    (args: { cluster?: string; phase?: string }) => {
      try {
        let experts = listExperts();
        if (args.cluster) {
          const c = args.cluster.toLowerCase();
          experts = experts.filter((e) => e.cluster === c);
        }
        if (args.phase) {
          const p = args.phase;
          experts = experts.filter((e) =>
            (e.recommendedPhases as string[]).includes(p),
          );
        }
        return okContent({
          ok: true,
          package: "@bpmforge/attest-experts",
          idRule:
            "expert id = attest primary agent filename minus '.md' (e.g. security-auditor.md -> 'security-auditor')",
          count: experts.length,
          experts: experts.map((e) => ({
            id: e.id,
            name: e.name,
            summary: e.summary,
            cluster: e.cluster,
            invocationHint: e.invocationHint,
            recommendedPhases: e.recommendedPhases,
            requiredTools: e.requiredTools,
            promptName: e.promptName,
            manifestUri: `attest://experts/${e.id}`,
          })),
        });
      } catch (err) {
        return errContent((err as Error).message, { tool: "list_experts" });
      }
    },
  );
}

/**
 * Factored out of buildServer so a single call-site keeps the generic
 * instantiation under TypeScript's complexity ceiling — registering 79 tools
 * inline inside a for-loop blows past TS2589.
 */
function registerValidatorTool(
  server: McpServer,
  descriptor: ValidatorDescriptor,
): void {
  server.registerTool(
    descriptor.toolName,
    {
      title: `attest validator — ${descriptor.id}`,
      description:
        `${descriptor.summary} (category: ${descriptor.category}). ` +
        `Wraps scripts/validators/validate-${descriptor.id}.sh. ` +
        `Returns {ok, exitCode, gaps, findings[], stdout, stderr, runtimeMs, projectRoot}.`,
      inputSchema: validatorInputSchema,
    },
    async (args: {
      projectRoot?: string;
      timeoutMs?: number;
      enableTelemetry?: boolean;
    }) => {
      try {
        const result = await runValidator(descriptor, {
          projectRoot: args.projectRoot,
          timeoutMs: args.timeoutMs,
          enableTelemetry: args.enableTelemetry,
        });
        return okContent({
          ok: result.ok,
          validator: result.validator,
          category: descriptor.category,
          exitCode: result.exitCode,
          gaps: result.envelope?.gaps ?? result.findings.length,
          findings: result.findings,
          stdout: result.stdout,
          stderr: result.stderr,
          timedOut: result.timedOut,
          runtimeMs: result.runtimeMs,
          projectRoot: result.projectRoot,
        });
      } catch (err) {
        return errContent((err as Error).message, {
          validator: descriptor.id,
        });
      }
    },
  );
}

const jsonText = (value: unknown): string => JSON.stringify(value, null, 2);

/**
 * Centralised JSON response for every validator / phase-gate / route tool so
 * clients see a predictable shape.
 */
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

/**
 * Build and configure the MCP server. The transport is attached by the
 * caller (cli.ts) so the server itself is testable in-process.
 */
export function buildServer(): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
        logging: {},
      },
    },
  );

  // ── Tools: one per validator ────────────────────────────────────────────
  const validators = listValidators();
  for (const descriptor of validators) {
    registerValidatorTool(server, descriptor);
  }

  registerPhaseGateTool(server);
  registerRouteGoalTool(server);
  registerListExpertsTool(server);

  // ── Resource: attest://experts/catalog ─────────────────────────────────
  server.registerResource(
    "experts-catalog",
    "attest://experts/catalog",
    {
      title: "attest primary experts catalog",
      description:
        "Every attest primary expert agent with its cluster, invocation hint " +
        "(for the sibling @bpmforge/attest-experts BDK agents), recommended " +
        "SDLC phases, and required-tool list. Same payload the `list_experts` " +
        "tool returns.",
      mimeType: "application/json",
    },
    async () => ({
      contents: [
        {
          uri: "attest://experts/catalog",
          mimeType: "application/json",
          text: jsonText(expertCatalogJSON()),
        },
      ],
    }),
  );

  // ── Resource: attest://experts/<id> (dynamic, per expert) ──────────────
  server.registerResource(
    "attest-experts",
    new ResourceTemplate("attest://experts/{id}", {
      list: async () => ({
        resources: listExperts().map((e) => ({
          uri: `attest://experts/${e.id}`,
          name: `expert:${e.id}`,
          title: e.name,
          description: e.summary,
          mimeType: "application/json",
        })),
      }),
      complete: {
        id: async (value: string) =>
          listExperts()
            .map((e) => e.id)
            .filter((id) => id.startsWith(value.toLowerCase())),
      },
    }),
    {
      title: "attest expert manifest",
      description:
        "Per-expert manifest with the full persona prompt, routing rationale, " +
        "and tool allowlist. Consumed by @bpmforge/attest-experts BDK agents " +
        "to stay in sync with the attest source of truth.",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const idVar = variables?.id;
      const id = Array.isArray(idVar) ? idVar[0] : idVar;
      if (!id) throw new Error("expert id required");
      if (!expertById(id)) throw new Error(`unknown expert: ${id}`);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: jsonText(expertManifestJSON(id)),
          },
        ],
      };
    },
  );

  // ── Resource: attest://phase-gate/state-machine ────────────────────────
  server.registerResource(
    "phase-gate-state-machine",
    "attest://phase-gate/state-machine",
    {
      title: "attest phase-gate state machine",
      description:
        "The SDLC phase-gate as structured JSON: phases, allowed " +
        "transitions, required gates per transition.",
      mimeType: "application/json",
    },
    async () => ({
      contents: [
        {
          uri: "attest://phase-gate/state-machine",
          mimeType: "application/json",
          text: jsonText(stateMachineJSON()),
        },
      ],
    }),
  );

  // ── Resource: attest://routing-table ───────────────────────────────────
  server.registerResource(
    "routing-table",
    "attest://routing-table",
    {
      title: "attest /guide routing table",
      description:
        "Plain-English-goal → expert-agent routing table (structured mirror of agents/guide.md).",
      mimeType: "application/json",
    },
    async () => ({
      contents: [
        {
          uri: "attest://routing-table",
          mimeType: "application/json",
          text: jsonText(routingTableJSON()),
        },
      ],
    }),
  );

  // ── Resource: attest://validators/catalog ──────────────────────────────
  server.registerResource(
    "validators-catalog",
    "attest://validators/catalog",
    {
      title: "attest validators catalog",
      description:
        "Index of every validator tool exposed by this server, with its " +
        "category and script path.",
      mimeType: "application/json",
    },
    async () => {
      const root = attestRoot();
      return {
        contents: [
          {
            uri: "attest://validators/catalog",
            mimeType: "application/json",
            text: jsonText({
              attestRoot: root.root,
              origin: root.origin,
              count: validators.length,
              validators: validators.map((v) => ({
                id: v.id,
                toolName: v.toolName,
                category: v.category,
                summary: v.summary,
                script: v.scriptPath.replace(root.root + "/", ""),
              })),
            }),
          },
        ],
      };
    },
  );

  // ── Resource: attest://protocols/<slug> (dynamic) ──────────────────────
  server.registerResource(
    "attest-protocols",
    new ResourceTemplate("attest://protocols/{slug}", {
      list: async () => ({
        resources: listProtocols().map((p) => ({
          uri: p.uri,
          name: `protocol:${p.slug}`,
          title: p.name,
          description: p.summary,
          mimeType: "text/markdown",
        })),
      }),
      complete: {
        slug: async (value: string) =>
          listProtocols()
            .map((p) => p.slug)
            .filter((s) => s.startsWith(value.toLowerCase())),
      },
    }),
    {
      title: "attest shared protocols",
      description:
        "One resource per shared protocol in attest's agents/shared/ " +
        "directory. Fetch e.g. attest://protocols/handoff-templates.",
      mimeType: "text/markdown",
    },
    async (uri, variables) => {
      const slugVar = variables?.slug;
      const slug = Array.isArray(slugVar) ? slugVar[0] : slugVar;
      if (!slug) throw new Error("protocol slug required");
      const proto = protocolBySlug(slug);
      if (!proto) throw new Error(`unknown protocol: ${slug}`);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/markdown",
            text: readProtocol(slug),
          },
        ],
      };
    },
  );

  // ── Prompts: prompt_expert_<name> for every primary agent ──────────────
  const expertPrompts = listExpertPrompts();
  for (const desc of expertPrompts) {
    server.registerPrompt(
      desc.promptName,
      {
        title: `attest expert — ${desc.name}`,
        description: desc.description,
      },
      () => ({
        messages: [
          {
            role: "user",
            content: { type: "text", text: readExpertPrompt(desc) },
          },
        ],
      }),
    );
  }

  // ── Prompts: prompt_sdlc_mode_<mode> for each SDLC mode ────────────────
  const sdlcPrompts = listSdlcModePrompts();
  for (const desc of sdlcPrompts) {
    registerSdlcModePrompt(server, desc);
  }

  return server;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sdlcModeArgsSchema: any = {
  description: z
    .string()
    .optional()
    .describe(
      "Fills the {{description}} placeholder in sdlc-feature / sdlc-improve bodies; ignored by modes that do not reference it.",
    ),
  name: z
    .string()
    .optional()
    .describe(
      "Fills the {{name}} placeholder in sdlc-init; ignored otherwise.",
    ),
};

function registerSdlcModePrompt(
  server: McpServer,
  desc: ReturnType<typeof listSdlcModePrompts>[number],
): void {
  const handler = ((args: { description?: string; name?: string }) => {
    let body = readSdlcModePrompt(desc);
    if (args?.description !== undefined) {
      body = body.replace(/\{\{\s*description\s*\}\}/g, args.description);
    }
    if (args?.name !== undefined) {
      body = body.replace(/\{\{\s*name\s*\}\}/g, args.name);
    }
    return {
      messages: [
        {
          role: "user" as const,
          content: { type: "text" as const, text: body },
        },
      ],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
  server.registerPrompt(
    desc.promptName,
    {
      title: `attest SDLC mode — ${desc.mode}`,
      description: desc.description,
      argsSchema: sdlcModeArgsSchema,
    },
    handler,
  );
}

export function serverInventory() {
  const validators = listValidators().length;
  const protocolCount = listProtocols().length;
  const expertCount = listExperts().length;
  const expertPromptCount = listExpertPrompts().length;
  const sdlcPromptCount = listSdlcModePrompts().length;
  return {
    tools: {
      validators,
      phase_gate_check: 1,
      route_goal: 1,
      list_experts: 1,
      total: validators + 3,
    },
    resources: {
      // phase-gate state-machine, routing-table, validators/catalog,
      // experts/catalog (4 fixed) + N protocol resources + N expert
      // manifest resources (the dynamic templates each list N children).
      static: 4,
      protocols: protocolCount,
      experts: expertCount,
      total: 4 + protocolCount + expertCount,
    },
    prompts: {
      experts: expertPromptCount,
      sdlcModes: sdlcPromptCount,
      total: expertPromptCount + sdlcPromptCount,
    },
  };
}
