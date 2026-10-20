/**
 * discussions.ts — the `ingest_discussion` tool implementation.
 *
 * Takes a raw text blob + a source hint, runs heuristic intent
 * extraction, builds a discussion-digest record, and returns the
 * digest + extracted intents. The caller (CEO agent) is responsible
 * for dedup against the ledger — this module stays stateless.
 */

import { randomUUID } from "node:crypto";
import { extractIntents, type ExtractResult } from "./intent.js";
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

export function ingestDiscussion(input: IngestInput): IngestResult {
  const episodeId = `disc-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomUUID().slice(0, 8)}`;
  const extraction = extractIntents({
    text: input.text,
    sourceEpisodeId: episodeId,
  });
  const digest: DiscussionDigest = {
    id: episodeId,
    source: input.source,
    ingestedAt: new Date().toISOString(),
    textPreview:
      input.text.length > 400 ? input.text.slice(0, 397) + "…" : input.text,
    intentIds: extraction.intents.map((i) => i.id),
  };
  return {
    digest,
    intents: extraction.intents,
    extraction,
    metadata: input.metadata ?? {},
  };
}
