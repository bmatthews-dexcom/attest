/**
 * server.ts — build the Director MCP server surface.
 *
 * Tools are grouped by lifecycle phase (per
 * `docs/attest-director-architecture.md` §4):
 *
 *   Phase 1 — detect-gap tools: `director.create_expert`, `proximity_check`,
 *   Phase 2 — research tools:  `research_role`,
 *   Phase 3 — draft tools:     `generate_persona`, `generate_schema`,
 *                              `generate_capabilities`, `generate_fixtures`,
 *                              `pick_form_factor`
 *   Phase 4 — eval tools:      `run_eval`
 *   Phase 5 — deploy tools:    `register_expert`, `director.on_expert_deployed`
 *   Phase 6 — refine tools:    `director.sweep`, `director.refine`
 *
 *   Shared surface: `director.show`, `director.list_briefs`, `director.audit`,
 *                   `director.rate`, `director.promote`, `director.demote`,
 *                   `director.retire`, `director.autonomy-set`,
 *                   `promote_to_shared`
 *
 *   Policy surface (snake_case, matches attest-mcp):
 *                   `evaluate_shell_policy`, `evaluate_write_policy`,
 *                   `evaluate_mcp_policy`, `list_fences`, `request_approval`
 *
 * The server also publishes two resources (per §10.3):
 *   - `attest-director://briefs/<id>/completion.json`
 *   - `attest-director://experts/<id>/summary.json`
 */
import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  FileKvStore,
  MemoryKvStore,
  type KvStore,
} from "./kv/store.js";
import { registerLifecycleTools } from "./tools/lifecycle.js";
import { registerPhaseTools } from "./tools/phases.js";
import { registerPolicyTools } from "./tools/policy.js";
import { registerShowTools } from "./tools/show.js";
import { registerPromotionTools } from "./tools/promotion.js";
import { registerResources } from "./tools/resources.js";

export const SERVER_NAME = "attest-director-mcp";
export const SERVER_VERSION = "0.0.1";

export interface BuildServerOptions {
  kv?: KvStore;
  /** Clock injection for deterministic tests. */
  now?: () => number;
}

export interface DirectorServerContext {
  kv: KvStore;
  now: () => number;
}

export function buildServer(opts: BuildServerOptions = {}): {
  server: McpServer;
  ctx: DirectorServerContext;
} {
  const kv =
    opts.kv ??
    (process.env.ATTEST_DIRECTOR_KV_IN_MEMORY === "1"
      ? new MemoryKvStore()
      : new FileKvStore(FileKvStore.defaultRoot()));
  const now = opts.now ?? (() => Date.now());

  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  const ctx: DirectorServerContext = { kv, now };

  registerLifecycleTools(server, ctx);
  registerPhaseTools(server, ctx);
  registerPolicyTools(server, ctx);
  registerShowTools(server, ctx);
  registerPromotionTools(server, ctx);
  registerResources(server, ctx);

  return { server, ctx };
}

export interface ServerInventory {
  tools: Array<{ name: string; description: string }>;
  resources: Array<{ uriTemplate: string; description: string }>;
}

export function serverInventory(): ServerInventory {
  return {
    tools: [
      // Phase 1 — detect gap
      { name: "director.create_expert", description: "CEO/Bradford entry — accept a role brief and run Phase 1 (proximity check + org-mission check + schema validation)." },
      { name: "proximity_check", description: "Phase-1 close-match sweep against the known expert catalog + rejected log; §4.7 decision tree." },
      // Phase 2 — research (stub)
      { name: "research_role", description: "Phase-2 synthesis: produce `role_research.md` + required-integrations list for a role brief." },
      // Phase 3 — draft
      { name: "generate_persona", description: "Phase-3 persona.md generator with explicit `does NOT do` negatives (aiwolfdial §Technique)." },
      { name: "generate_schema", description: "Phase-3 JSON Schema generator — zod/ajv-compatible." },
      { name: "generate_capabilities", description: "Phase-3 capability map generator matching the chief's registry type." },
      { name: "generate_fixtures", description: "Phase-3 fixture generator — 3–5 fixtures with rubric criteria." },
      { name: "pick_form_factor", description: "Phase-3 form-factor decision tree per §5.1." },
      // Phase 4 — eval
      { name: "run_eval", description: "Phase-4 GLIDER-style eval harness — runs fixtures, scores against rubric, applies pass bar." },
      // Phase 5 — deploy + CEO entry
      { name: "register_expert", description: "Phase-5 register — writes private manifest entry + hot-register with attest-mcp handler framework." },
      { name: "director.on_expert_deployed", description: "Phase-5 CEO notification — tells the CEO that an expert for its plan is live." },
      // Phase 6 — refine
      { name: "director.sweep", description: "Phase-6 cron sweep — re-run evals, check edit-distance signals, propose refinements." },
      { name: "director.refine", description: "Open a refinement proposal (§9) for a specific expert." },
      // Shared surface
      { name: "director.list_briefs", description: "List all role briefs with their state (proposed, deployed, rejected, parked, ...)." },
      { name: "director.show", description: "Show a specific brief / expert / refinement by id." },
      { name: "director.audit", description: "Query the decision log with filters (brief, expert, since)." },
      { name: "director.rate", description: "Record an explicit good/bad rating on a live expert." },
      { name: "director.promote", description: "Open a promotion proposal — private → shared (§8.3)." },
      { name: "director.demote", description: "Reverse promotion — shared → private (§8.4)." },
      { name: "director.retire", description: "Retire a live expert — removes from both tiers after approval." },
      { name: "director.autonomy-set", description: "Set the Director's own autonomy config (mode + auto-for-repeat-role)." },
      { name: "promote_to_shared", description: "Internal helper used by `director.promote` — moves artifacts into packages/attest-experts/." },
      // Policy
      { name: "evaluate_shell_policy", description: "Evaluate a shell command against Director's fence inventory." },
      { name: "evaluate_write_policy", description: "Evaluate a filesystem write against Director's fence inventory." },
      { name: "evaluate_mcp_policy", description: "Evaluate an MCP tool call against Director's fence inventory." },
      { name: "list_fences", description: "List the current Director fence inventory (§6)." },
      { name: "request_approval", description: "Director's HITL ask — mirrors the chief's `request_approval`." },
    ],
    resources: [
      {
        uriTemplate: "attest-director://briefs/{briefId}/completion.json",
        description: "Completion report the CEO polls on its cron tick (§10.3).",
      },
      {
        uriTemplate: "attest-director://experts/{expertId}/summary.json",
        description: "Live expert summary resource; what the chief catalog surfaces.",
      },
    ],
  };
}

export { ResourceTemplate };
