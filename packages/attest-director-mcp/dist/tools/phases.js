import { z } from "zod";
import { okJson, errJson } from "./_shared.js";
import { RoleBriefSchema } from "../schema/role-brief.js";
import { CapabilityMapSchema } from "../schema/capabilities.js";
import { pickFormFactor } from "../form-factor/pick.js";
import { generatePersona } from "../draft/persona.js";
import { generateSchema } from "../draft/schema-gen.js";
import { generateFixtures } from "../draft/fixtures.js";
import { runEval, defaultLexicalJudge } from "../eval/judge.js";
function registerPhaseTools(server, ctx) {
  server.registerTool(
    "proximity_check",
    {
      description: "Run the Phase-1 proximity sweep (lexical fallback \u2014 production uses attest-mcp.route_goal). Returns the \xA74.7 verdict + top-3 matches.",
      inputSchema: {
        brief: z.object({
          role: z.string().min(1),
          mission: z.string().min(1),
          responsibilities: z.array(z.string().min(1)).min(1)
        }).passthrough(),
        catalog: z.array(
          z.object({
            expertId: z.string().min(1),
            mission: z.string().min(1),
            responsibilitiesText: z.string().optional(),
            capabilityTags: z.array(z.string()).optional()
          })
        ).default([])
      }
    },
    async (args) => {
      const { runProximityCheck } = await import("../proximity/check.js");
      const { roleFingerprint } = await import("../schema/role-brief.js");
      const fp = roleFingerprint({
        role: args.brief.role,
        mission: args.brief.mission,
        responsibilities: args.brief.responsibilities
      });
      const result = runProximityCheck(
        {
          role: args.brief.role,
          mission: args.brief.mission,
          responsibilities: args.brief.responsibilities
        },
        args.catalog,
        fp
      );
      return okJson({ proximity: result, fingerprint: fp });
    }
  );
  server.registerTool(
    "research_role",
    {
      description: "Phase-2 synthesis \u2014 produce the research summary + required-integrations list. Stub emits a deterministic skeleton; production routes through the configured research MCPs.",
      inputSchema: {
        brief: z.object({}).passthrough()
      }
    },
    async (args) => {
      const briefParse = RoleBriefSchema.safeParse(args.brief);
      if (!briefParse.success) return errJson("invalid brief", briefParse.error.format());
      const brief = briefParse.data;
      const research = {
        role: brief.role,
        typicalResponsibilities: brief.responsibilities,
        adjacentRoles: deriveAdjacent(brief.role),
        domainContext: brief.domain_context ?? "unspecified",
        inputsSeen: brief.typical_inputs.map((i) => i.name),
        outputsExpected: brief.typical_outputs.map((o) => o.name),
        priorArtNotes: "Scanned the chief catalog's `landscape-mapper`, `researcher`, and `app-cartographer` outputs for adjacent methodology."
      };
      const integrations = brief.required_integrations.map((req) => ({
        kind: req.kind,
        pick: req.candidates[0],
        rationale: `top candidate from ${req.candidates.length} option(s); production ranks per \xA77.2.`,
        state: req.install_steps_tbd ? "install-requires-approval" : "already-installed"
      }));
      return okJson({ research, integrations });
    }
  );
  server.registerTool(
    "pick_form_factor",
    {
      description: "Run the \xA75.1 form-factor decision tree against a capability map.",
      inputSchema: {
        capabilities: z.object({}).passthrough(),
        preference: z.enum(["auto", "skill", "in-process-handler", "sandbox-bdk-agent"]).optional().default("auto"),
        advisoryEditorOnly: z.boolean().optional(),
        longRunningStreaming: z.boolean().optional()
      }
    },
    async (args) => {
      const parse = CapabilityMapSchema.safeParse(args.capabilities);
      if (!parse.success) return errJson("invalid capability map", parse.error.format());
      const result = pickFormFactor({
        capabilities: parse.data,
        preference: args.preference,
        advisoryEditorOnly: args.advisoryEditorOnly,
        longRunningStreaming: args.longRunningStreaming
      });
      return okJson(result);
    }
  );
  server.registerTool(
    "generate_persona",
    {
      description: "Phase-3 persona.md generator (scaffold with explicit negatives + self-check).",
      inputSchema: {
        brief: z.object({}).passthrough()
      }
    },
    async (args) => {
      const parse = RoleBriefSchema.safeParse(args.brief);
      if (!parse.success) return errJson("invalid brief", parse.error.format());
      return okJson(generatePersona(parse.data));
    }
  );
  server.registerTool(
    "generate_schema",
    {
      description: "Phase-3 JSON Schema generator.",
      inputSchema: {
        brief: z.object({}).passthrough()
      }
    },
    async (args) => {
      const parse = RoleBriefSchema.safeParse(args.brief);
      if (!parse.success) return errJson("invalid brief", parse.error.format());
      return okJson(generateSchema(parse.data));
    }
  );
  server.registerTool(
    "generate_capabilities",
    {
      description: "Phase-3 capability map generator. Returns the brief's requested capabilities, validated against the chief's registry type.",
      inputSchema: {
        brief: z.object({}).passthrough()
      }
    },
    async (args) => {
      const parse = RoleBriefSchema.safeParse(args.brief);
      if (!parse.success) return errJson("invalid brief", parse.error.format());
      return okJson(parse.data.requested_capabilities);
    }
  );
  server.registerTool(
    "generate_fixtures",
    {
      description: "Phase-3 fixture generator \u2014 3-5 fixtures with rubric criteria. Always includes a `fx-4-package-private` fixture that enforces the no-npm constraint on the generated expert's package.json.",
      inputSchema: {
        brief: z.object({}).passthrough()
      }
    },
    async (args) => {
      const parse = RoleBriefSchema.safeParse(args.brief);
      if (!parse.success) return errJson("invalid brief", parse.error.format());
      return okJson(generateFixtures(parse.data));
    }
  );
  server.registerTool(
    "run_eval",
    {
      description: "Phase-4 eval harness \u2014 run fixtures against mock candidate outputs, score via GLIDER-style lexical judge, apply pass bar (default 0.8). Returns full report + wholesale-fail detection.",
      inputSchema: {
        fixtures: z.array(z.object({}).passthrough()).min(1),
        /**
         * Caller supplies candidate outputs by fixture id — in production the
         * eval harness runs the drafted expert against each fixture; the
         * MCP server stays dependency-free by expecting the orchestrator to
         * pass the outputs in.
         */
        candidates: z.record(z.string(), z.string()).default({}),
        passBar: z.number().min(0).max(1).optional()
      }
    },
    async (args) => {
      const fixtures = args.fixtures;
      const report = await runEval({
        fixtures,
        runExpert: async (fx) => args.candidates[fx.id] ?? "",
        judge: defaultLexicalJudge,
        passBar: args.passBar
      });
      return okJson(report);
    }
  );
}
function deriveAdjacent(role) {
  const parts = role.split("-");
  const base = parts.at(-1) ?? role;
  return [
    `${base}-analyst`,
    `incident-${base}`,
    `root-cause-${base}`
  ].filter((r) => r !== role);
}
export {
  registerPhaseTools
};
//# sourceMappingURL=phases.js.map
