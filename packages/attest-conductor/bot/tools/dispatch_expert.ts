import { defineTool } from "@cursor/bdk/tools";
import * as z from "zod/v4";
import {
  alreadyApplied,
  recordAction,
  taskKey,
  type ConductorTask,
  type ExpertVisit,
  type IterationLog,
} from "../lib/conductor-state.js";
import {
  findExpert,
  knownExpertIds,
  resolveExpertMode,
} from "../lib/experts-registry.js";

/**
 * BDK agent slug attest-experts publishes for a given expert id. Mirrors
 * `defineExpert({ name: "attest-expert-<id>" })` in
 * `packages/attest-experts/lib/expert-factory.ts`. Kept as a pure
 * derivation (no hardcoded set) because the ported-vs-stub decision now
 * reads `mcpEntry.ported` from attest-mcp's `list_experts` catalog, not
 * a local allow-list.
 */
function peerSlugForExpert(expertId: string): string {
  return `attest-expert-${expertId}`;
}

type DispatchArtifact = string | number | boolean | null;

type DispatchResult = {
  expertId: string;
  mode: "stub" | "peer" | "http" | "not-ported";
  status: "ok" | "escalated" | "failed" | "not-ported";
  summary: string;
  artifacts: Record<string, DispatchArtifact>;
  findings: Array<{ severity: "soft" | "gate"; message: string }>;
  taskPersisted: boolean;
  already?: boolean;
};

type McpExpertEntry = {
  readonly id: string;
  readonly name?: string;
  readonly summary?: string;
  readonly cluster?: string;
  readonly invocationHint?: {
    readonly package?: string;
    readonly agent?: string;
    readonly spawn?: string;
  };
  /**
   * True when `@bpmforge/attest-experts` ships a concrete BDK agent for
   * this id; false when it only exposes a `refuse-not-ported` stub.
   * Added by attest-mcp. Missing on pre-ported-field servers; we treat
   * `undefined` as "assume concrete peer dispatch is viable" (old
   * behaviour) so a stale attest-mcp does not silently refuse every
   * dispatch.
   */
  readonly ported?: boolean;
};

/**
 * In-non-stub-mode, dispatch_expert fetches `list_experts` once per
 * process from attest-mcp and caches the result here. Keyed by server
 * name ("attest" today, future-proofed in case the connection name
 * changes). Reset per process; evals and tests run on a fresh module
 * each time.
 */
const catalogCache = new Map<string, Map<string, McpExpertEntry>>();
const catalogLoading = new Map<string, Promise<Map<string, McpExpertEntry>>>();

function isRealMcpMode(): boolean {
  return typeof process.env.ATTEST_MCP_COMMAND === "string"
    && process.env.ATTEST_MCP_COMMAND.trim() !== "";
}

type McpCallable = {
  host: {
    mcp: {
      callTool: (
        server: string,
        tool: string,
        input?: Record<string, unknown>,
      ) => Promise<unknown>;
    };
  };
};

async function loadMcpCatalog(
  ctx: McpCallable,
  server: string,
): Promise<Map<string, McpExpertEntry>> {
  const cached = catalogCache.get(server);
  if (cached) return cached;
  const pending = catalogLoading.get(server);
  if (pending) return pending;
  const task = (async () => {
    try {
      const raw = await ctx.host.mcp.callTool(server, "list_experts", {});
      const parsed = parseExpertCatalog(raw);
      catalogCache.set(server, parsed);
      return parsed;
    } finally {
      catalogLoading.delete(server);
    }
  })();
  catalogLoading.set(server, task);
  return task;
}

function parseExpertCatalog(raw: unknown): Map<string, McpExpertEntry> {
  const out = new Map<string, McpExpertEntry>();
  // The MCP SDK returns `{ content: [{ type: "text", text: "<json>" }] }`
  // for structured tool results. Also tolerate a direct `{ experts: [...] }`
  // or an array.
  let payload: unknown = raw;
  if (payload && typeof payload === "object" && "content" in payload) {
    const content = (payload as { content?: unknown }).content;
    if (Array.isArray(content) && content.length > 0 && typeof content[0] === "object") {
      const first = content[0] as { text?: string };
      if (typeof first.text === "string") {
        try {
          payload = JSON.parse(first.text);
        } catch {
          /* fall through */
        }
      }
    }
  }
  let list: unknown = payload;
  if (payload && typeof payload === "object" && "experts" in payload) {
    list = (payload as { experts?: unknown }).experts;
  }
  if (Array.isArray(list)) {
    for (const entry of list) {
      if (entry && typeof entry === "object" && "id" in entry) {
        const row = entry as McpExpertEntry;
        if (typeof row.id === "string") {
          out.set(row.id, row);
        }
      }
    }
  }
  return out;
}

export default defineTool({
  description:
    "Dispatch an expert BDK agent for one unit of work. In non-stub mode (ATTEST_MCP_COMMAND is set), fetches `list_experts` from attest-mcp once per process and uses the MCP catalog's `invocationHint` as the source of truth for peer slugs — the local registry is only consulted as a fallback or in stub mode. The Phase-2 stub short-circuit is driven by the catalog entry's `ported` field: when attest-mcp reports `ported === false` the dispatch returns a structured `not-ported` error so the Ralph loop can escalate or route to a concrete expert (no local hardcoded id list is consulted). With ATTEST_EXPERT_<ID>_PEER=<slug> set, overrides the catalog-derived slug and calls that peer's `ask` tool via ctx.host.mcp. With ATTEST_EXPERT_<ID>_URL=... set, POSTs to the deployed expert over HTTP. **Persists the visit directly to the task's `visitedExperts`** so Ralph can observe it next iteration. Idempotent via `actionId`.",
  effect: "write",
  inputSchema: z.object({
    taskId: z.string(),
    expertId: z
      .string()
      .min(1)
      .describe("Expert id (e.g. security-auditor, code-reviewer, landscape-mapper)."),
    prompt: z
      .string()
      .min(1)
      .describe("Full prompt for the expert — goal + HANDOFF-shaped scope."),
    actionId: z.string().describe("Deterministic id for idempotent retry."),
  }),
  async execute(input, ctx): Promise<DispatchResult> {
    const key = taskKey(input.taskId);
    const task = (await ctx.host.kv.get(key)) as ConductorTask | undefined;

    if (!task) {
      return {
        expertId: input.expertId,
        mode: "stub",
        status: "failed",
        summary: `no task ${input.taskId}`,
        artifacts: {},
        findings: [{ severity: "gate", message: `task ${input.taskId} not found` }],
        taskPersisted: false,
      };
    }

    const dup = alreadyApplied(task, input.actionId);
    if (dup.already) {
      const prior = task.visitedExperts.find((v) => v.actionId === input.actionId);
      if (prior) {
        return {
          expertId: prior.expertId,
          mode: "stub",
          status: prior.status,
          summary: prior.summary,
          artifacts: { replayed: true },
          findings: [],
          taskPersisted: true,
          already: true,
        };
      }
    }

    const realMode = isRealMcpMode();
    let mcpEntry: McpExpertEntry | undefined;
    if (realMode) {
      try {
        const catalog = await loadMcpCatalog(ctx, "attest");
        mcpEntry = catalog.get(input.expertId);
      } catch (err) {
        // Fall through to local-only resolution; log the failure to the
        // task so the Ralph loop can see the catalog didn't load.
        const message = err instanceof Error ? err.message : String(err);
        return {
          expertId: input.expertId,
          mode: "stub",
          status: "failed",
          summary: `attest-mcp list_experts failed: ${message}`,
          artifacts: {},
          findings: [
            {
              severity: "gate",
              message: `attest-mcp catalog fetch failed; cannot resolve expert ids reliably. ${message}`,
            },
          ],
          taskPersisted: false,
        };
      }
    }

    // In non-stub mode, the MCP catalog is the source of truth for which
    // expert ids exist. In stub mode we fall back to the local registry.
    if (realMode && !mcpEntry) {
      return {
        expertId: input.expertId,
        mode: "stub",
        status: "failed",
        summary: `attest-mcp catalog does not know "${input.expertId}". Call list_experts (or route_goal) to see the available ids.`,
        artifacts: {},
        findings: [
          {
            severity: "gate",
            message: `expertId "${input.expertId}" is not in the attest-mcp list_experts catalog.`,
          },
        ],
        taskPersisted: false,
      };
    }

    const localExpert = findExpert(input.expertId);
    if (!realMode && !localExpert) {
      return {
        expertId: input.expertId,
        mode: "stub",
        status: "failed",
        summary: `Unknown expert "${input.expertId}". Known (stub registry): ${knownExpertIds().join(", ")}.`,
        artifacts: {},
        findings: [
          {
            severity: "gate",
            message: `expert "${input.expertId}" not in the local stub registry; attest-mcp catalog not available (stub mode).`,
          },
        ],
        taskPersisted: false,
      };
    }

    // Phase-2 stub expert in attest-experts? Short-circuit with a
    // structured not_ported response so Ralph can route differently.
    // This mirrors the shape attest-experts' refuse-not-ported tool
    // returns, without the round-trip (the stub BDK agent only exposes
    // refuse-not-ported anyway).
    //
    // Trigger: the attest-mcp catalog entry's `ported` field is strictly
    // `false`. Missing (`undefined`) means the attest-mcp server predates
    // the ported field — fall through to the peer-dispatch branch to
    // preserve the pre-field behaviour (every id was tried as a peer).
    if (realMode && mcpEntry && mcpEntry.ported === false) {
      const summary = `expert "${input.expertId}" is a Phase-2 stub in @bpmforge/attest-experts (list_experts reported ported=false); dispatch refused. Escalate to the user, pick a concrete expert, or wait until this id is ported.`;
      const result: DispatchResult = {
        expertId: input.expertId,
        mode: "not-ported",
        status: "not-ported",
        summary,
        artifacts: {
          stubbed: true,
          phase: 2,
          package: mcpEntry.invocationHint?.package ?? "@bpmforge/attest-experts",
          agentSlug:
            mcpEntry.invocationHint?.agent ?? peerSlugForExpert(input.expertId),
          portedField: false,
        },
        findings: [{ severity: "gate", message: summary }],
        taskPersisted: false,
      };
      return persistAndReturn(ctx, task, key, input, result);
    }

    // Resolve dispatch transport. Env-var overrides win when present (operator
    // steering a specific run); otherwise the attest-experts BDK slug is
    // `attest-expert-<id>` for ported experts.
    const envMode = resolveExpertMode(input.expertId);
    let mode: { kind: "stub" } | { kind: "peer"; slug: string } | { kind: "http"; url: string };
    if (envMode.kind !== "stub") {
      mode = envMode;
    } else if (realMode && mcpEntry && mcpEntry.ported !== false) {
      // Prefer the catalog-derived agent slug when the real MCP is active
      // and the expert is ported (or on an attest-mcp old enough to lack
      // the `ported` field — treat as "try the peer").
      const slug =
        mcpEntry?.invocationHint?.agent &&
        mcpEntry.invocationHint.agent.startsWith("attest-expert-")
          ? mcpEntry.invocationHint.agent
          : peerSlugForExpert(input.expertId);
      mode = { kind: "peer", slug };
    } else {
      mode = { kind: "stub" };
    }

    const invocationHintText =
      (realMode
        ? mcpEntry?.invocationHint?.spawn
        : localExpert?.invocationHint) ?? "(no invocation hint)";

    let result: DispatchResult;
    if (mode.kind === "stub") {
      const label = localExpert?.id ?? input.expertId;
      const summary = `[stub ${label}] handled "${task.goal}" at phase ${task.currentPhase}. ${invocationHintText}`;
      result = {
        expertId: input.expertId,
        mode: "stub",
        status: "ok",
        summary,
        artifacts: {
          stubbed: true,
          expert: label,
          promptPreview: input.prompt.slice(0, 240),
        },
        findings: [],
        taskPersisted: false,
      };
    } else if (mode.kind === "peer") {
      try {
        const raw = await ctx.host.mcp.callTool(mode.slug, "ask", { message: input.prompt });
        result = {
          expertId: input.expertId,
          mode: "peer",
          status: "ok",
          summary: summarizePeerResult(raw),
          artifacts: {
            peerSlug: mode.slug,
            source: mcpEntry ? "mcp-catalog" : "env-or-derived",
          },
          findings: [],
          taskPersisted: false,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result = {
          expertId: input.expertId,
          mode: "peer",
          status: "failed",
          summary: `peer "${mode.slug}" dispatch failed: ${message}`,
          artifacts: { peerSlug: mode.slug },
          findings: [{ severity: "gate", message }],
          taskPersisted: false,
        };
      }
    } else {
      try {
        const response = await fetch(`${mode.url.replace(/\/$/, "")}/v1/session`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: input.prompt }),
        });
        const body = (await response.json()) as unknown;
        if (!response.ok) {
          result = {
            expertId: input.expertId,
            mode: "http",
            status: "failed",
            summary: `http dispatch to ${mode.url} returned ${response.status}`,
            artifacts: { url: mode.url, status: response.status },
            findings: [
              { severity: "gate", message: `expert http returned ${response.status}` },
            ],
            taskPersisted: false,
          };
        } else {
          result = {
            expertId: input.expertId,
            mode: "http",
            status: "ok",
            summary: summarizeHttpResult(body),
            artifacts: { url: mode.url },
            findings: [],
            taskPersisted: false,
          };
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result = {
          expertId: input.expertId,
          mode: "http",
          status: "failed",
          summary: `http dispatch to ${mode.url} threw: ${message}`,
          artifacts: { url: mode.url },
          findings: [{ severity: "gate", message }],
          taskPersisted: false,
        };
      }
    }

    return persistAndReturn(ctx, task, key, input, result);
  },
});

async function persistAndReturn(
  ctx: { host: { kv: { put(key: string, value: unknown): Promise<void> } } },
  task: ConductorTask,
  key: string,
  input: { expertId: string; prompt: string; actionId: string },
  result: DispatchResult,
): Promise<DispatchResult> {
  const now = Date.now();
  const visit: ExpertVisit = {
    iteration: task.iteration,
    expertId: input.expertId,
    prompt: input.prompt,
    summary: result.summary,
    status: resultStatusToVisit(result.status),
    actionId: input.actionId,
    tsMs: now,
  };
  const logEntry: IterationLog = {
    iteration: task.iteration,
    action: "dispatch_expert",
    summary: `${input.expertId} ${result.status}: ${result.summary.slice(0, 160)}`,
    tsMs: now,
  };
  const nextIteration = task.iteration + 1;
  const consecutiveNoProgress =
    result.status === "ok" ? 0 : task.consecutiveNoProgress + 1;
  const updated: ConductorTask = recordAction(
    {
      ...task,
      iteration: nextIteration,
      consecutiveNoProgress,
      visitedExperts: [...task.visitedExperts, visit],
      iterationLog: [...task.iterationLog, logEntry],
      lastSummary: result.summary,
    },
    input.actionId,
    nextIteration,
  );
  await ctx.host.kv.put(key, updated);
  result.taskPersisted = true;
  return result;
}

/**
 * `not-ported` doesn't need to persist its own ExpertVisit `status`
 * channel in the task — the state machine only tracks ok / failed /
 * escalated at this level, so map `not-ported` to `failed`. The caller
 * sees the richer status in the tool return.
 */
function resultStatusToVisit(status: DispatchResult["status"]): ExpertVisit["status"] {
  if (status === "ok") return "ok";
  if (status === "escalated") return "escalated";
  return "failed";
}

function summarizePeerResult(raw: unknown): string {
  if (raw && typeof raw === "object" && "content" in raw) {
    const content = (raw as { content?: unknown }).content;
    if (Array.isArray(content) && content.length > 0 && typeof content[0] === "object") {
      const first = content[0] as { text?: string };
      if (typeof first.text === "string") {
        return first.text.slice(0, 1_000);
      }
    }
  }
  return "peer expert returned without a text payload";
}

function summarizeHttpResult(raw: unknown): string {
  if (raw && typeof raw === "object") {
    const asRecord = raw as Record<string, unknown>;
    if (typeof asRecord.text === "string") return asRecord.text.slice(0, 1_000);
    if (typeof asRecord.summary === "string") return asRecord.summary.slice(0, 1_000);
  }
  return "http expert returned without a known payload";
}

/**
 * Test helper: clear the module-level MCP catalog cache between runs.
 * Not advertised as an MCP tool.
 */
export function __resetExpertCatalogCacheForTesting(): void {
  catalogCache.clear();
  catalogLoading.clear();
}
