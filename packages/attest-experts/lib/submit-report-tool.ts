/**
 * Shared `submit_report` tool used by every concrete expert.
 *
 * - Validates the structured return against {@link expertOutputSchema}.
 * - Pins the `expert_id` on the server side so the model cannot spoof it.
 * - Persists the report to `ctx.host.kv` namespaced by `task_id` and to
 *   `ctx.host.files` for durable retrieval by the conductor.
 */
import { defineTool } from "@cursor/bdk/tools";
import type { ToolDefinition } from "@cursor/bdk";
import * as z from "zod/v4";

import { expertOutputSchema, expertKvKey } from "./schema.js";

const submitInputSchema = z.object({
  task_id: z.string().min(1),
  findings: z
    .array(
      z.object({
        id: z.string().min(1),
        severity: z.enum(["low", "medium", "high", "critical"]),
        title: z.string().min(1),
        evidence: z.string().min(1),
        fix: z.string().optional(),
        effort: z.enum(["trivial", "small", "medium", "large"]).optional(),
        module: z.string().optional(),
      }),
    )
    .default([]),
  suggested_next_phase: z.string().nullable().default(null),
  blockers: z.array(z.string().min(1)).default([]),
  artifacts: z
    .array(
      z.object({
        path: z.string().min(1),
        description: z.string().min(1),
        kind: z
          .enum(["report", "findings", "diagram", "patch", "data", "other"])
          .default("other"),
      }),
    )
    .default([]),
  done: z.boolean(),
  summary: z.string().min(1),
});

export function submitReportTool(expertId: string): ToolDefinition {
  return defineTool({
    description:
      "Submit this expert's final structured report for the current task_id. Validates against the shared attest-experts output schema; call exactly once per task.",
    effect: "write",
    inputSchema: submitInputSchema,
    async execute(input, ctx) {
      const report = { ...input, expert_id: expertId };

      const parsed = expertOutputSchema.safeParse(report);
      if (!parsed.success) {
        return {
          ok: false,
          error: "output schema validation failed",
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
            code: i.code,
          })),
        };
      }

      const kvKey = expertKvKey(expertId, report.task_id, "report.json");
      await ctx.host.kv.put(kvKey, parsed.data);

      const fileKey = `attest/experts/${expertId}/${report.task_id}/report.json`;
      await ctx.host.files.write(fileKey, JSON.stringify(parsed.data, null, 2), {
        scope: { kind: "deployment", partition: report.task_id },
      });

      return {
        ok: true,
        expert_id: expertId,
        task_id: report.task_id,
        kv_key: kvKey,
        file_key: fileKey,
        done: report.done,
        finding_count: report.findings.length,
        blocker_count: report.blockers.length,
      };
    },
  }) as ToolDefinition;
}
