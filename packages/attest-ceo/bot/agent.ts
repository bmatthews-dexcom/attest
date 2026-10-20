import { defineAgent } from "@cursor/bdk";

/**
 * attest CEO — Phase 1 (Shape 1 of the design doc).
 *
 * Persistent BDK agent that sits above the attest chief and owns:
 *   - a durable roadmap + commitment ledger (ctx.host.kv under `ceo:*`);
 *   - intent extraction from discussions pasted into Cursor chat;
 *   - plan drafting + approval round-trip;
 *   - dispatch to the chief (via the sibling attest-conductor MCP);
 *   - resumption on chief completion notifications.
 *
 * Phase 1 scope is deliberately narrow: Cursor chat ingestion only; no
 * Slack / Linear / GitHub webhooks (Phase 2), no Zep temporal graph
 * (Phase 2), no proactive nudging (Phase 3). See
 * `/cursor/stores/.../docs/attest-ceo-architecture.md`.
 */
export default defineAgent({});
