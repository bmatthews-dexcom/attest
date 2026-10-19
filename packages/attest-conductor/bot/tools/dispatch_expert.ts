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

type DispatchArtifact = string | number | boolean | null;

type DispatchResult = {
  expertId: string;
  mode: "stub" | "peer" | "http";
  status: "ok" | "escalated" | "failed";
  summary: string;
  artifacts: Record<string, DispatchArtifact>;
  findings: Array<{ severity: "soft" | "gate"; message: string }>;
  taskPersisted: boolean;
  already?: boolean;
};

export default defineTool({
  description:
    "Dispatch an expert BDK agent for one unit of work. In stub mode (default) returns a canned expert response so the Ralph loop can run before the sibling attest-experts package publishes real slugs. With `ATTEST_EXPERT_<ID>_PEER=<slug>` set, calls the peer agent's `ask` tool via ctx.host.mcp. With `ATTEST_EXPERT_<ID>_URL=…` set, POSTs to the deployed expert over HTTP. **Persists the visit directly to the task's `visitedExperts`** so Ralph can observe it next iteration. Idempotent via `actionId`.",
  effect: "write",
  inputSchema: z.object({
    taskId: z.string(),
    expertId: z
      .string()
      .min(1)
      .describe("Expert id (e.g. security-reviewer, code-reviewer, docs)."),
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

    const expert = findExpert(input.expertId);
    if (!expert) {
      return {
        expertId: input.expertId,
        mode: "stub",
        status: "failed",
        summary: `Unknown expert "${input.expertId}". Known: ${knownExpertIds().join(", ")}.`,
        artifacts: {},
        findings: [
          {
            severity: "gate",
            message: `route_goal returned "${input.expertId}" which is not in the conductor's registry.`,
          },
        ],
        taskPersisted: false,
      };
    }

    const mode = resolveExpertMode(input.expertId);
    let result: DispatchResult;
    if (mode.kind === "stub") {
      const summary = `[stub ${input.expertId}] handled "${task.goal}" at phase ${task.currentPhase}. ${expert.invocationHint}`;
      result = {
        expertId: input.expertId,
        mode: "stub",
        status: "ok",
        summary,
        artifacts: {
          stubbed: true,
          expert: expert.id,
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
          artifacts: { peerSlug: mode.slug },
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

    const now = Date.now();
    const visit: ExpertVisit = {
      iteration: task.iteration,
      expertId: input.expertId,
      prompt: input.prompt,
      summary: result.summary,
      status: result.status,
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
  },
});

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
