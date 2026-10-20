/**
 * Policy tool surface — mirrors `attest-mcp` snake_case shape:
 *   `evaluate_shell_policy`, `evaluate_write_policy`, `evaluate_mcp_policy`,
 *   `list_fences`, `request_approval`.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { DirectorServerContext } from "../server.js";
import { okJson } from "./_shared.js";
import {
  evaluateMcpPolicy,
  evaluateShellPolicy,
  evaluateWritePolicy,
} from "../policy/cedar.js";
import { FENCES } from "../policy/fences.js";
import { runRequestApproval } from "../approvals/request.js";
import { AUTONOMY_MODES } from "../schema/autonomy.js";

export function registerPolicyTools(
  server: McpServer,
  ctx: DirectorServerContext,
): void {
  server.registerTool(
    "evaluate_shell_policy",
    {
      description:
        "Evaluate a shell command against Director's fence inventory. Returns `{ decision, capability, ruleId, reason, tier? }`.",
      inputSchema: {
        command: z.string().min(1),
        args: z.array(z.string()).optional(),
        approvalGranted: z.boolean().optional(),
      },
    },
    async (args) => {
      return okJson(
        evaluateShellPolicy({
          command: args.command,
          args: args.args,
          context: { approvalGranted: args.approvalGranted },
        }),
      );
    },
  );

  server.registerTool(
    "evaluate_write_policy",
    {
      description:
        "Evaluate a filesystem write against Director's fence inventory. Draft artifacts under experts-private/ are allow; writes to .cursor/mcp.json and workspace skills are ask-each; writes to customer source are deny.",
      inputSchema: {
        path: z.string().min(1),
        approvalGranted: z.boolean().optional(),
      },
    },
    async (args) => {
      return okJson(
        evaluateWritePolicy({
          path: args.path,
          context: { approvalGranted: args.approvalGranted },
        }),
      );
    },
  );

  server.registerTool(
    "evaluate_mcp_policy",
    {
      description:
        "Evaluate an MCP tool call against Director's fence inventory. Writes/edits to ceo/chief namespaces are deny; reads are allow; subagent spawns are ask-each.",
      inputSchema: {
        server: z.string().min(1),
        tool: z.string().min(1),
        approvalGranted: z.boolean().optional(),
      },
    },
    async (args) => {
      return okJson(
        evaluateMcpPolicy({
          server: args.server,
          tool: args.tool,
          context: { approvalGranted: args.approvalGranted },
        }),
      );
    },
  );

  server.registerTool(
    "list_fences",
    {
      description: "List Director's current fence inventory (§6).",
      inputSchema: {
        tier: z.enum(["always-granted", "ask-each", "never"]).optional(),
      },
    },
    async (args) => {
      const scoped = args.tier ? FENCES.filter((f) => f.tier === args.tier) : FENCES;
      return okJson({ count: scoped.length, fences: scoped });
    },
  );

  server.registerTool(
    "request_approval",
    {
      description:
        "Director's HITL ask — mirrors `attest-conductor` `request_approval`. Fail-closed when neither MCP elicitation nor GitHub comment-approve is wired. Called by Director for every ask-each capability (edit:.cursor/mcp.json, cursor-deploy, push:personal-gh, pr:open:local-attest-repo, write:workspace:cursor-skills, spawn:subagent).",
      inputSchema: {
        taskId: z.string().min(1),
        capability: z.string().min(1),
        prompt: z.string().min(1),
        destructiveOp: z.string().optional(),
        target: z.string().optional(),
        requestedByExpertId: z.string().optional(),
        autonomyMode: z.enum(AUTONOMY_MODES).optional(),
        timeoutMs: z.number().int().positive().optional(),
        github: z
          .object({
            owner: z.string().min(1),
            repo: z.string().min(1),
            issueNumber: z.number().int().positive(),
            commentId: z.number().int().positive().optional(),
          })
          .optional(),
      },
    },
    async (args) => {
      // The server-side tool here has neither mcpElicit nor postGithubComment
      // wired — those are supplied by the Director BDK agent when it embeds
      // the MCP tool. The outcome in a bare-stdio run is therefore
      // `no_hitl_transport`; the agent-side wrapper injects the transports.
      const result = await runRequestApproval(
        { kv: ctx.kv, now: ctx.now },
        {
          taskId: args.taskId,
          capability: args.capability,
          prompt: args.prompt,
          destructiveOp: args.destructiveOp,
          target: args.target,
          requestedByExpertId: args.requestedByExpertId,
          autonomyMode: args.autonomyMode,
          timeoutMs: args.timeoutMs,
          github: args.github,
        },
      );
      return okJson(result);
    },
  );
}
