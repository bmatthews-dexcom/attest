/**
 * discussions.ts — the `ingest_discussion` tool implementation.
 *
 * Takes a raw text blob + a source hint, runs heuristic intent
 * extraction, builds a discussion-digest record, and returns the
 * digest + extracted intents. The caller (CEO agent) is responsible
 * for dedup against the ledger — this module stays stateless.
 */
import { type ExtractResult } from "./intent.js";
import type { DiscussionDigest, DiscussionSource, Intent } from "./types.js";
export type IngestInput = {
    source: DiscussionSource;
    text: string;
    metadata?: Record<string, unknown>;
};
export type IngestResult = {
    digest: DiscussionDigest;
    intents: Intent[];
    extraction: ExtractResult;
    metadata: Record<string, unknown>;
};
export declare function ingestDiscussion(input: IngestInput): IngestResult;
//# sourceMappingURL=discussions.d.ts.map