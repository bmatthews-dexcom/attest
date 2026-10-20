/**
 * ledger.ts — tiny in-memory CEO ledger backing the roadmap /
 * commitments / autonomy resources the MCP server exposes.
 *
 * **Scope.** This file is deliberately _not_ the primary store. The
 * design doc (§6) puts the real ledger in the CEO BDK agent's
 * `ctx.host.kv`. The MCP server runs as a child process; it does not
 * own durable state. What this module gives us is:
 *
 *  1. A deterministic, test-friendly default so tool/resource calls
 *     work out of the box (no "ledger not initialized" errors in
 *     tool-call-only clients).
 *  2. A write surface for `ingest_discussion`, `draft_plan`, and
 *     `dispatch_plan` to update their own output shapes without
 *     reaching back into the agent for storage.
 *  3. A clean seam for the CEO agent to push its real kv-backed
 *     ledger into the server at startup (via `setLedger`) when it
 *     wants the resources to mirror what it's actually tracking.
 *
 * Persistence to disk is deliberately NOT wired here — Phase 1 is
 * single-tenant single-process; `ctx.host.kv` is the one durable store.
 */
import { type CeoLedger } from "./types.js";
/** Replace the whole ledger. Used by the CEO agent at startup. */
export declare function setLedger(next: CeoLedger): void;
/** Shallow-merge an update into the current ledger and bump `updatedAt`. */
export declare function updateLedger(mutate: (ledger: CeoLedger) => CeoLedger): CeoLedger;
export declare function getLedger(): CeoLedger;
/** Convenience: just the open commitments (phase-1 default). */
export declare function openCommitments(ledger?: CeoLedger): import("./types.js").Commitment[];
//# sourceMappingURL=ledger.d.ts.map