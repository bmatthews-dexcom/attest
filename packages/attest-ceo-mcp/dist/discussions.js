/**
 * discussions.ts — the `ingest_discussion` tool implementation.
 *
 * Takes a raw text blob + a source hint, runs heuristic intent
 * extraction, builds a discussion-digest record, and returns the
 * digest + extracted intents. The caller (CEO agent) is responsible
 * for dedup against the ledger — this module stays stateless.
 */
import { randomUUID } from "node:crypto";
import { extractIntents } from "./intent.js";
export function ingestDiscussion(input) {
    const episodeId = `disc-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomUUID().slice(0, 8)}`;
    const extraction = extractIntents({
        text: input.text,
        sourceEpisodeId: episodeId,
    });
    const digest = {
        id: episodeId,
        source: input.source,
        ingestedAt: new Date().toISOString(),
        textPreview: input.text.length > 400 ? input.text.slice(0, 397) + "…" : input.text,
        intentIds: extraction.intents.map((i) => i.id),
    };
    return {
        digest,
        intents: extraction.intents,
        extraction,
        metadata: input.metadata ?? {},
    };
}
//# sourceMappingURL=discussions.js.map