/**
 * server.ts — build the attest-ceo MCP server.
 *
 * Shape mirrors `attest-mcp`: tools + resources only
 * (no prompts in Phase 1). The server runs as a stdio child process
 * driven by `cli.ts`; the CEO BDK agent connects via peer MCP and
 * drives tool calls directly.
 *
 * Resources:
 *   attest://ceo/roadmap/current      — ordered initiatives list
 *   attest://ceo/commitments/open     — commitments with state=open|in-flight
 *   attest://ceo/decisions/log        — append-only decisions
 *   attest://ceo/autonomy/current     — current CEO autonomy mode
 *
 * Tools:
 *   ingest_discussion(source, text, metadata?)
 *   extract_intent(text, minConfidence?)
 *   draft_plan(intent, context?, dispatchMode?)
 *   dispatch_plan(plan, autonomyMode, conductorTool?)
 *   director_create_expert(role, example_task, inputs, outputs, urgency)
 *   roadmap_sync(ledger)      — CEO agent pushes its canonical kv ledger
 *                                into this server so the resources stay
 *                                in sync. The agent is the source of
 *                                truth; this server is just the surface.
 *   roadmap_set_initiative(initiative) — add or replace one initiative
 *   commitments_upsert(commitment)      — add or replace one commitment
 *   autonomy_set(mode)                   — update the autonomy resource
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export declare const SERVER_NAME = "attest-ceo";
export declare const SERVER_VERSION = "0.0.1";
/**
 * Build and configure the attest-ceo MCP server. The transport is
 * attached by the caller (cli.ts).
 */
export declare function buildServer(): McpServer;
export declare function serverInventory(): {
    tools: {
        ingest_discussion: number;
        extract_intent: number;
        draft_plan: number;
        approve_plan: number;
        deny_plan: number;
        refine_plan: number;
        dispatch_plan: number;
        director_create_expert: number;
        roadmap_sync: number;
        roadmap_set_initiative: number;
        commitments_upsert: number;
        autonomy_set: number;
        total: number;
    };
    resources: {
        roadmapCurrent: "attest://ceo/roadmap/current";
        commitmentsOpen: "attest://ceo/commitments/open";
        decisionsLog: "attest://ceo/decisions/log";
        autonomy: "attest://ceo/autonomy/current";
        total: number;
    };
};
//# sourceMappingURL=server.d.ts.map