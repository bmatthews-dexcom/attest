import { defineConnection } from "@cursor/bdk/connections";
import * as z from "zod/v4";

/**
 * MCP connection to the sibling `attest-conductor` BDK agent.
 *
 * The chief's `run_autopilot_task` tool is what the CEO's `dispatch_plan`
 * blueprint resolves into — the CEO calls it once per plan step.
 *
 * In production: a real peer MCP connection pointing at either the local
 * `bdk serve --dir packages/attest-conductor` process or a hosted deploy.
 * Env hooks mirror attest-conductor's own `attest-mcp` connection:
 *
 *   ATTEST_CONDUCTOR_MCP_COMMAND=node \
 *   ATTEST_CONDUCTOR_MCP_ARGS='["<path-to-bdk>/serve/..."]'
 *
 * Default (no env): an inline stub that mirrors the conductor's
 * `run_autopilot_task` shape so the CEO can exercise its full dispatch
 * loop without a credential or a running conductor. The stub records
 * each dispatch via its own `invocations` map so the eval can assert on
 * the call.
 */

const explicitCommand = process.env.ATTEST_CONDUCTOR_MCP_COMMAND;

function parseArgsJson(raw: string): string[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) {
      return parsed;
    }
  } catch {
    // fall through
  }
  return null;
}

const stubInvocations: Array<{
  taskId: string;
  goal: string;
  tsMs: number;
}> = [];

const stubTools = {
  run_autopilot_task: {
    description:
      "attest-conductor stub: pretend to kick off a chief task; return a fake taskId immediately. The CEO treats this as a dispatch handle.",
    inputSchema: z.object({
      goal: z.string().min(1),
      iterationCap: z.number().int().positive().optional(),
      wallTimeCapMs: z.number().int().positive().optional(),
      consecutiveNoProgressCap: z.number().int().positive().optional(),
      maxTurns: z.number().int().positive().optional(),
    }),
    execute(input: Record<string, unknown>) {
      const goal = (input.goal as string) ?? "";
      const taskId = `task_stub_${stubInvocations.length + 1}`;
      const tsMs = Date.now();
      stubInvocations.push({ taskId, goal, tsMs });
      return {
        taskId,
        goal,
        stop: { kind: "stub-dispatch", reason: "conductor stub" },
        turns: 0,
        task: {
          taskId,
          goal,
          status: "running",
          currentPhase: "intake",
          iteration: 0,
        },
      };
    },
  },
  stub_list_invocations: {
    description: "stub-only helper: list recent dispatches (eval introspection).",
    inputSchema: z.object({}),
    execute() {
      return { invocations: [...stubInvocations] };
    },
  },
};

export default explicitCommand
  ? defineConnection({
      command: explicitCommand,
      args: process.env.ATTEST_CONDUCTOR_MCP_ARGS
        ? (parseArgsJson(process.env.ATTEST_CONDUCTOR_MCP_ARGS) ?? [])
        : [],
      advertiseTools: true,
    })
  : defineConnection({
      tools: stubTools,
      description:
        "Inline attest-conductor stub (run_autopilot_task). Replace with the real server by setting ATTEST_CONDUCTOR_MCP_COMMAND.",
    });
