import { defineConnection } from "@cursor/bdk/connections";
import * as z from "zod/v4";
import { mockTaskStatus } from "attest-ceo-mcp/dispatch";

/**
 * MCP connection to the sibling `attest-mcp` server.
 *
 * CEO uses attest-mcp to read task status + task completion for
 * reconciliation on each turn. Shape C of attest-mcp adds two new
 * resources (`attest://tasks/<id>/status.json` and
 * `attest://tasks/<id>/completion.json`); until those land, the stub
 * fakes them with `mockTaskStatus` + a no-op completion.
 *
 * TODO(ceo): switch to the real resources when attest-mcp Shape C merges.
 */

const explicitCommand = process.env.ATTEST_MCP_COMMAND;

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

const stubTools = {
  read_task_status: {
    description:
      "attest-mcp stub (CEO view): mock `attest://tasks/<id>/status.json` until Shape C ships the resource.",
    inputSchema: z.object({ taskId: z.string().min(1) }),
    execute(input: Record<string, unknown>) {
      return mockTaskStatus(input.taskId as string);
    },
  },
  read_task_completion: {
    description:
      "attest-mcp stub (CEO view): mock `attest://tasks/<id>/completion.json`; returns `{ present: false }` for in-flight tasks.",
    inputSchema: z.object({ taskId: z.string().min(1) }),
    execute(input: Record<string, unknown>) {
      return { present: false, taskId: input.taskId as string };
    },
  },
};

export default explicitCommand
  ? defineConnection({
      command: explicitCommand,
      args: process.env.ATTEST_MCP_ARGS
        ? (parseArgsJson(process.env.ATTEST_MCP_ARGS) ?? [])
        : [],
      advertiseTools: true,
    })
  : defineConnection({
      tools: stubTools,
      description:
        "Inline attest-mcp stub (CEO view). Replace with the real server by setting ATTEST_MCP_COMMAND; Shape C adds the real status/completion resources.",
    });
