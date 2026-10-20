import {
  McpServer,
  ResourceTemplate
} from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  FileKvStore,
  MemoryKvStore
} from "./kv/store.js";
import { registerLifecycleTools } from "./tools/lifecycle.js";
import { registerPhaseTools } from "./tools/phases.js";
import { registerPolicyTools } from "./tools/policy.js";
import { registerShowTools } from "./tools/show.js";
import { registerPromotionTools } from "./tools/promotion.js";
import { registerResources } from "./tools/resources.js";
const SERVER_NAME = "attest-director-mcp";
const SERVER_VERSION = "0.0.1";
function buildServer(opts = {}) {
  const kv = opts.kv ?? (process.env.ATTEST_DIRECTOR_KV_IN_MEMORY === "1" ? new MemoryKvStore() : new FileKvStore(FileKvStore.defaultRoot()));
  const now = opts.now ?? (() => Date.now());
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION
  });
  const ctx = { kv, now };
  registerLifecycleTools(server, ctx);
  registerPhaseTools(server, ctx);
  registerPolicyTools(server, ctx);
  registerShowTools(server, ctx);
  registerPromotionTools(server, ctx);
  registerResources(server, ctx);
  return { server, ctx };
}
function serverInventory() {
  return {
    tools: [
      // Phase 1 — detect gap
      { name: "director.create_expert", description: "CEO/Bradford entry \u2014 accept a role brief and run Phase 1 (proximity check + org-mission check + schema validation)." },
      { name: "proximity_check", description: "Phase-1 close-match sweep against the known expert catalog + rejected log; \xA74.7 decision tree." },
      // Phase 2 — research (stub)
      { name: "research_role", description: "Phase-2 synthesis: produce `role_research.md` + required-integrations list for a role brief." },
      // Phase 3 — draft
      { name: "generate_persona", description: "Phase-3 persona.md generator with explicit `does NOT do` negatives (aiwolfdial \xA7Technique)." },
      { name: "generate_schema", description: "Phase-3 JSON Schema generator \u2014 zod/ajv-compatible." },
      { name: "generate_capabilities", description: "Phase-3 capability map generator matching the chief's registry type." },
      { name: "generate_fixtures", description: "Phase-3 fixture generator \u2014 3\u20135 fixtures with rubric criteria." },
      { name: "pick_form_factor", description: "Phase-3 form-factor decision tree per \xA75.1." },
      // Phase 4 — eval
      { name: "run_eval", description: "Phase-4 GLIDER-style eval harness \u2014 runs fixtures, scores against rubric, applies pass bar." },
      // Phase 5 — deploy + CEO entry
      { name: "register_expert", description: "Phase-5 register \u2014 writes private manifest entry + hot-register with attest-mcp handler framework." },
      { name: "director.on_expert_deployed", description: "Phase-5 CEO notification \u2014 tells the CEO that an expert for its plan is live." },
      // Phase 6 — refine
      { name: "director.sweep", description: "Phase-6 cron sweep \u2014 re-run evals, check edit-distance signals, propose refinements." },
      { name: "director.refine", description: "Open a refinement proposal (\xA79) for a specific expert." },
      // Shared surface
      { name: "director.list_briefs", description: "List all role briefs with their state (proposed, deployed, rejected, parked, ...)." },
      { name: "director.show", description: "Show a specific brief / expert / refinement by id." },
      { name: "director.audit", description: "Query the decision log with filters (brief, expert, since)." },
      { name: "director.rate", description: "Record an explicit good/bad rating on a live expert." },
      { name: "director.promote", description: "Open a promotion proposal \u2014 private \u2192 shared (\xA78.3)." },
      { name: "director.demote", description: "Reverse promotion \u2014 shared \u2192 private (\xA78.4)." },
      { name: "director.retire", description: "Retire a live expert \u2014 removes from both tiers after approval." },
      { name: "director.autonomy-set", description: "Set the Director's own autonomy config (mode + auto-for-repeat-role)." },
      { name: "promote_to_shared", description: "Internal helper used by `director.promote` \u2014 moves artifacts into packages/attest-experts/." },
      // Policy
      { name: "evaluate_shell_policy", description: "Evaluate a shell command against Director's fence inventory." },
      { name: "evaluate_write_policy", description: "Evaluate a filesystem write against Director's fence inventory." },
      { name: "evaluate_mcp_policy", description: "Evaluate an MCP tool call against Director's fence inventory." },
      { name: "list_fences", description: "List the current Director fence inventory (\xA76)." },
      { name: "request_approval", description: "Director's HITL ask \u2014 mirrors the chief's `request_approval`." }
    ],
    resources: [
      {
        uriTemplate: "attest-director://briefs/{briefId}/completion.json",
        description: "Completion report the CEO polls on its cron tick (\xA710.3)."
      },
      {
        uriTemplate: "attest-director://experts/{expertId}/summary.json",
        description: "Live expert summary resource; what the chief catalog surfaces."
      }
    ]
  };
}
export {
  ResourceTemplate,
  SERVER_NAME,
  SERVER_VERSION,
  buildServer,
  serverInventory
};
//# sourceMappingURL=server.js.map
