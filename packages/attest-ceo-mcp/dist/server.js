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
import { z } from "zod";
import { McpServer, } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AUTONOMY_MODES, DEFAULT_CONDUCTOR_DISPATCH_TOOL, RESOURCE_URIS, emptyLedger, } from "./types.js";
import { getLedger, openCommitments, setLedger, updateLedger } from "./ledger.js";
import { ingestDiscussion } from "./discussions.js";
import { extractIntents } from "./intent.js";
import { approvePlan, denyPlan, draftPlan, refinePlan } from "./plan.js";
import { buildDispatchBlueprint } from "./dispatch.js";
import { stubCreateExpert } from "./director.js";
export const SERVER_NAME = "attest-ceo";
export const SERVER_VERSION = "0.0.1";
const jsonText = (value) => JSON.stringify(value, null, 2);
function okContent(payload) {
    return {
        content: [{ type: "text", text: jsonText(payload) }],
    };
}
function errContent(message, extra = {}) {
    return {
        isError: true,
        content: [
            {
                type: "text",
                text: jsonText({ ok: false, error: message, ...extra }),
            },
        ],
    };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ingestInputSchema = {
    source: z
        .object({
        channel: z.enum([
            "cursor-chat",
            "paste",
            "slack",
            "linear",
            "github",
            "notes",
            "email",
            "other",
        ]),
        hint: z.string().optional(),
        url: z.string().nullable().optional(),
        referenceTime: z.string().nullable().optional(),
    })
        .describe("Where the discussion came from (channel + optional hint/url/reference time)."),
    text: z
        .string()
        .min(1)
        .describe("Raw discussion text (Cursor chat body, pasted Slack thread, meeting notes, etc.)."),
    metadata: z
        .record(z.unknown())
        .optional()
        .describe("Opaque metadata to round-trip into the digest."),
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const extractIntentInputSchema = {
    text: z.string().min(1).describe("Raw text to extract intents from."),
    minConfidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Minimum confidence per intent (default 0.4)."),
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const intentShape = z.object({
    id: z.string(),
    summary: z.string(),
    kind: z.enum([
        "new-feature",
        "bug",
        "finding",
        "decision",
        "question",
        "chore",
    ]),
    confidence: z.number().min(0).max(1),
    sourceEpisode: z.string(),
    proposedCommitmentText: z.string(),
    fingerprint: z.string(),
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const draftPlanInputSchema = {
    intent: intentShape.describe("The intent to plan around (as returned by extract_intent)."),
    context: z
        .object({
        commitments: z.array(z.any()).optional(),
        scopeHint: z.string().optional(),
        phaseHint: z.string().optional(),
    })
        .optional()
        .describe("Already-open commitments + optional scope/phase hints."),
    dispatchMode: z
        .enum(["concurrent", "sequenced"])
        .optional()
        .describe('Dispatch mode: "sequenced" (default) or "concurrent".'),
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dispatchPlanInputSchema = {
    plan: z.any().describe("The approved plan (as returned by draft_plan + approve_plan)."),
    autonomyMode: z
        .enum(AUTONOMY_MODES)
        .describe("Current CEO autonomy mode."),
    conductorTool: z
        .string()
        .optional()
        .describe(`Override the conductor tool name (default: ${DEFAULT_CONDUCTOR_DISPATCH_TOOL}).`),
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const directorInputSchema = {
    role: z.string().min(1).describe("Role name for the new expert, e.g. `fireflies-ingester`."),
    example_task: z.string().min(1).describe("A concrete example task the expert will handle."),
    inputs: z.array(z.string()).describe("Named inputs the expert expects."),
    outputs: z.array(z.string()).describe("Named outputs the expert produces."),
    urgency: z.enum(["low", "medium", "high"]).describe("Expert-build urgency."),
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const roadmapSetInitiativeInputSchema = {
    initiative: z.any().describe("Initiative record (schema matches types.Initiative)."),
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const commitmentsUpsertInputSchema = {
    commitment: z.any().describe("Commitment record (schema matches types.Commitment)."),
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const autonomySetInputSchema = {
    mode: z
        .enum(AUTONOMY_MODES)
        .describe("New autonomy mode."),
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const roadmapSyncInputSchema = {
    ledger: z.any().describe("Full ledger snapshot from the CEO agent's kv (CeoLedger)."),
};
/**
 * Build and configure the attest-ceo MCP server. The transport is
 * attached by the caller (cli.ts).
 */
export function buildServer() {
    const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, {
        capabilities: {
            tools: {},
            resources: {},
            logging: {},
        },
    });
    // ── Tools ────────────────────────────────────────────────────────────
    server.registerTool("ingest_discussion", {
        title: "attest-ceo: ingest a discussion",
        description: "Normalize a raw discussion (pasted Slack thread, meeting notes, " +
            "GitHub comment body, Cursor chat segment) into a digest + heuristic " +
            "intents. Does NOT dedupe or write to the ledger — the CEO agent " +
            "owns dedup against its kv and decides whether to open new commitments.",
        inputSchema: ingestInputSchema,
    }, (args) => {
        try {
            const result = ingestDiscussion({
                source: args.source,
                text: args.text,
                metadata: args.metadata,
            });
            return okContent(result);
        }
        catch (err) {
            return errContent(err.message, { tool: "ingest_discussion" });
        }
    });
    server.registerTool("extract_intent", {
        title: "attest-ceo: extract intents from text",
        description: "Deterministic heuristic intent extractor. Splits text into " +
            "paragraphs, classifies each as new-feature | bug | finding | " +
            "decision | question | chore, assigns a confidence score, and " +
            "computes a dedup fingerprint. The CEO agent re-runs its own LLM " +
            "extractor on top; this surface is for tests / smoke / clients " +
            "that do not have a model credential.",
        inputSchema: extractIntentInputSchema,
    }, (args) => {
        try {
            const extraction = extractIntents({
                text: args.text,
                minConfidence: args.minConfidence,
            });
            return okContent(extraction);
        }
        catch (err) {
            return errContent(err.message, { tool: "extract_intent" });
        }
    });
    server.registerTool("draft_plan", {
        title: "attest-ceo: draft a plan",
        description: "Turn an intent + optional context into a draft Plan (awaiting-approval). " +
            "Does NOT dispatch — the CEO agent surfaces the plan to Bradford and " +
            "waits for `/ceo approve` before calling `dispatch_plan`.",
        inputSchema: draftPlanInputSchema,
    }, (args) => {
        try {
            const plan = draftPlan({
                intent: args.intent,
                context: args.context,
                dispatchMode: args.dispatchMode,
            });
            return okContent(plan);
        }
        catch (err) {
            return errContent(err.message, { tool: "draft_plan" });
        }
    });
    server.registerTool("approve_plan", {
        title: "attest-ceo: approve a plan",
        description: "Flip a plan to approvalState=approved and bump updatedAt.",
        inputSchema: { plan: z.any() },
    }, (args) => {
        try {
            return okContent(approvePlan(args.plan));
        }
        catch (err) {
            return errContent(err.message, { tool: "approve_plan" });
        }
    });
    server.registerTool("deny_plan", {
        title: "attest-ceo: deny a plan",
        description: "Flip a plan to approvalState=denied.",
        inputSchema: { plan: z.any() },
    }, (args) => {
        try {
            return okContent(denyPlan(args.plan));
        }
        catch (err) {
            return errContent(err.message, { tool: "deny_plan" });
        }
    });
    server.registerTool("refine_plan", {
        title: "attest-ceo: refine a plan (new version)",
        description: "Produce a new plan version (v+1) with a modified title and rationale, " +
            "flipped back to awaiting-approval. Caller keeps the original around.",
        inputSchema: {
            plan: z.any(),
            title: z.string().min(1),
            rationale: z.string().min(1),
        },
    }, (args) => {
        try {
            return okContent(refinePlan(args.plan, args.title, args.rationale));
        }
        catch (err) {
            return errContent(err.message, { tool: "refine_plan" });
        }
    });
    server.registerTool("dispatch_plan", {
        title: "attest-ceo: build dispatch blueprint",
        description: "Return a dispatch blueprint for an approved plan: which conductor " +
            "tool to call, per-step inputs, dispatch mode, and skipped-reason " +
            "entries for docs-only steps. The CEO agent executes the blueprint " +
            "over its `attest-conductor` MCP connection (we do NOT call the " +
            "chief from this process). Respects autonomy mode: watch/nudge/" +
            "draft-only short-circuit; draft-and-approve requires approvalState=" +
            "approved; auto-dispatch skips the approval gate.",
        inputSchema: dispatchPlanInputSchema,
    }, (args) => {
        try {
            const blueprint = buildDispatchBlueprint({
                plan: args.plan,
                autonomyMode: args.autonomyMode,
                conductorTool: args.conductorTool,
            });
            return okContent(blueprint);
        }
        catch (err) {
            return errContent(err.message, { tool: "dispatch_plan" });
        }
    });
    server.registerTool("director_create_expert", {
        title: "attest-ceo: request a new expert from the Director",
        description: "Request the Director agent build a new expert for a given role. " +
            "Currently a stub — the Director is still being designed. The " +
            "`ATTEST_DIRECTOR_ENABLED` env var is the flag that will flip this " +
            "from stub to live once the Director deploys. Shape stays stable so " +
            "callers do not change.",
        inputSchema: directorInputSchema,
    }, (args) => {
        try {
            return okContent(stubCreateExpert(args));
        }
        catch (err) {
            return errContent(err.message, {
                tool: "director_create_expert",
            });
        }
    });
    server.registerTool("roadmap_sync", {
        title: "attest-ceo: push CEO kv ledger into the server",
        description: "The CEO agent is the source of truth for the ledger (lives in " +
            "`ctx.host.kv`). This tool lets the agent push a snapshot into the " +
            "MCP server so the roadmap / commitments / autonomy resources " +
            "reflect the agent's current state. Call at agent startup and " +
            "after every mutating turn.",
        inputSchema: roadmapSyncInputSchema,
    }, (args) => {
        try {
            setLedger(args.ledger ?? emptyLedger());
            return okContent({ ok: true, resourcesSynced: Object.keys(RESOURCE_URIS) });
        }
        catch (err) {
            return errContent(err.message, { tool: "roadmap_sync" });
        }
    });
    server.registerTool("roadmap_set_initiative", {
        title: "attest-ceo: upsert an initiative",
        description: "Add or replace a single initiative in the roadmap (by id).",
        inputSchema: roadmapSetInitiativeInputSchema,
    }, (args) => {
        try {
            const updated = updateLedger((ledger) => {
                const next = ledger.roadmap.filter((i) => i.id !== args.initiative.id);
                next.push(args.initiative);
                return { ...ledger, roadmap: next };
            });
            return okContent({ ok: true, roadmap: updated.roadmap });
        }
        catch (err) {
            return errContent(err.message, {
                tool: "roadmap_set_initiative",
            });
        }
    });
    server.registerTool("commitments_upsert", {
        title: "attest-ceo: upsert a commitment",
        description: "Add or replace a single commitment (by id).",
        inputSchema: commitmentsUpsertInputSchema,
    }, (args) => {
        try {
            const updated = updateLedger((ledger) => {
                const next = ledger.commitments.filter((c) => c.id !== args.commitment.id);
                next.push(args.commitment);
                return { ...ledger, commitments: next };
            });
            return okContent({ ok: true, commitments: updated.commitments.length });
        }
        catch (err) {
            return errContent(err.message, { tool: "commitments_upsert" });
        }
    });
    server.registerTool("autonomy_set", {
        title: "attest-ceo: set autonomy mode",
        description: "Set the current CEO autonomy mode. The agent still owns the kv " +
            "value; this just mirrors it so the resource stays current.",
        inputSchema: autonomySetInputSchema,
    }, (args) => {
        try {
            const updated = updateLedger((ledger) => ({
                ...ledger,
                autonomy: args.mode,
            }));
            return okContent({ ok: true, autonomy: updated.autonomy });
        }
        catch (err) {
            return errContent(err.message, { tool: "autonomy_set" });
        }
    });
    // ── Resources ────────────────────────────────────────────────────────
    server.registerResource("ceo-roadmap-current", RESOURCE_URIS.roadmapCurrent, {
        title: "attest-ceo roadmap (current)",
        description: "Ordered list of initiatives + rolled-up commitment ids. Snapshot " +
            "of the CEO agent's kv at the last roadmap_sync (or set-* tool call).",
        mimeType: "application/json",
    }, async () => ({
        contents: [
            {
                uri: RESOURCE_URIS.roadmapCurrent,
                mimeType: "application/json",
                text: jsonText({
                    updatedAt: getLedger().updatedAt,
                    roadmap: getLedger().roadmap,
                }),
            },
        ],
    }));
    server.registerResource("ceo-commitments-open", RESOURCE_URIS.commitmentsOpen, {
        title: "attest-ceo open commitments",
        description: "Commitments with state ∈ { open, in-flight }. Snapshot of the " +
            "CEO agent's kv at the last roadmap_sync (or set-* tool call).",
        mimeType: "application/json",
    }, async () => ({
        contents: [
            {
                uri: RESOURCE_URIS.commitmentsOpen,
                mimeType: "application/json",
                text: jsonText({
                    updatedAt: getLedger().updatedAt,
                    count: openCommitments().length,
                    commitments: openCommitments(),
                }),
            },
        ],
    }));
    server.registerResource("ceo-decisions-log", RESOURCE_URIS.decisionsLog, {
        title: "attest-ceo decisions (append-only)",
        description: "Append-only decision log. Each entry carries { what, when, inputs, " +
            "rationale, policyEvaluation?, confidence? }.",
        mimeType: "application/json",
    }, async () => ({
        contents: [
            {
                uri: RESOURCE_URIS.decisionsLog,
                mimeType: "application/json",
                text: jsonText({
                    updatedAt: getLedger().updatedAt,
                    decisions: getLedger().decisions,
                }),
            },
        ],
    }));
    server.registerResource("ceo-autonomy-current", RESOURCE_URIS.autonomy, {
        title: "attest-ceo autonomy mode (current)",
        description: "The current CEO autonomy mode. Default: draft-and-approve. " +
            "Changes require explicit Bradford approval (elicitation on the " +
            "agent side).",
        mimeType: "application/json",
    }, async () => ({
        contents: [
            {
                uri: RESOURCE_URIS.autonomy,
                mimeType: "application/json",
                text: jsonText({
                    updatedAt: getLedger().updatedAt,
                    autonomy: getLedger().autonomy,
                }),
            },
        ],
    }));
    return server;
}
export function serverInventory() {
    return {
        tools: {
            ingest_discussion: 1,
            extract_intent: 1,
            draft_plan: 1,
            approve_plan: 1,
            deny_plan: 1,
            refine_plan: 1,
            dispatch_plan: 1,
            director_create_expert: 1,
            roadmap_sync: 1,
            roadmap_set_initiative: 1,
            commitments_upsert: 1,
            autonomy_set: 1,
            total: 12,
        },
        resources: {
            roadmapCurrent: RESOURCE_URIS.roadmapCurrent,
            commitmentsOpen: RESOURCE_URIS.commitmentsOpen,
            decisionsLog: RESOURCE_URIS.decisionsLog,
            autonomy: RESOURCE_URIS.autonomy,
            total: 4,
        },
    };
}
//# sourceMappingURL=server.js.map