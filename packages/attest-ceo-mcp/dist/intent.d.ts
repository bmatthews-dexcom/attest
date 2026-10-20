/**
 * intent.ts — heuristic intent extraction.
 *
 * Phase 1 posture: this module is a thin, deterministic extractor that
 * splits a discussion into one or more candidate intents. It is NOT the
 * LLM-driven extractor that lives on the CEO agent side — the CEO
 * agent reads the raw text through its own prompt and merges with
 * these heuristics. Shipping both lets `extract_intent` work in
 * credential-free contexts (tests, smoke, hillclimb seeding) while the
 * agent-side extractor handles the real work in production.
 *
 * The envelope dedupe fingerprint is `sha-256(normalized_summary)` so
 * two syntactically-close intents land on the same key — matches the
 * dedupe shape in design doc §5.
 */
import type { Intent } from "./types.js";
export declare function fingerprint(summary: string): string;
export type ExtractInput = {
    text: string;
    sourceEpisodeId?: string;
    minConfidence?: number;
};
export type ExtractResult = {
    intents: Intent[];
    rawParagraphs: number;
    minConfidence: number;
};
/**
 * Split the discussion into paragraphs; each paragraph with >= 6 words
 * becomes one candidate intent. Confidence is a crude heuristic: longer
 * paragraphs that match a strong kind pattern score higher. All of this
 * is deterministic (no LLM call) so tests pin cleanly.
 */
export declare function extractIntents(input: ExtractInput): ExtractResult;
//# sourceMappingURL=intent.d.ts.map