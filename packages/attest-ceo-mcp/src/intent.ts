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

import { createHash, randomUUID } from "node:crypto";
import type { Intent, IntentKind } from "./types.js";

const KIND_RULES: Array<{ kind: IntentKind; patterns: RegExp[] }> = [
  {
    kind: "bug",
    patterns: [
      /\bbug\b/i,
      /\bbroken\b/i,
      /\bregression\b/i,
      /\bfails?\b/i,
      /\berror\b/i,
      /\bcrash/i,
    ],
  },
  {
    kind: "finding",
    patterns: [
      /\bslow\b/i,
      /\bperf(ormance)?\b/i,
      /\bnoticed\b/i,
      /\binconsistent\b/i,
      /\bconfusing\b/i,
    ],
  },
  {
    kind: "decision",
    patterns: [
      /\bdecided\b/i,
      /\bagreed\b/i,
      /\bwe'?ll\s+go\s+with\b/i,
      /\blet'?s\s+(use|pick|choose)\b/i,
    ],
  },
  {
    kind: "question",
    patterns: [/\?$/, /\bshould\s+we\b/i, /\bwhen\s+will\b/i, /\bwhy\b/i],
  },
  {
    kind: "chore",
    patterns: [/\bchore\b/i, /\brefactor\b/i, /\bcleanup?\b/i, /\btidy\b/i],
  },
  {
    kind: "new-feature",
    patterns: [
      /\badd\b/i,
      /\bship\b/i,
      /\bbuild\b/i,
      /\bimplement\b/i,
      /\bsupport\s+(for\s+)?/i,
      /\bfeature\b/i,
    ],
  },
];

function classify(text: string): IntentKind {
  for (const rule of KIND_RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      return rule.kind;
    }
  }
  return "finding";
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]+/g, "")
    .trim();
}

export function fingerprint(summary: string): string {
  return createHash("sha256")
    .update(normalize(summary))
    .digest("hex")
    .slice(0, 32);
}

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
export function extractIntents(input: ExtractInput): ExtractResult {
  const minConfidence = input.minConfidence ?? 0.4;
  const episode = input.sourceEpisodeId ?? `discussion-${randomUUID()}`;
  const text = (input.text ?? "").trim();
  if (!text) return { intents: [], rawParagraphs: 0, minConfidence };

  const paragraphs = text
    .split(/\n\s*\n|(?<=[.?!])\s{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const intents: Intent[] = [];
  for (const [i, para] of paragraphs.entries()) {
    const words = para.split(/\s+/).length;
    if (words < 6) continue;
    const kind = classify(para);
    const strong = KIND_RULES.find((r) => r.kind === kind)?.patterns.some(
      (p) => p.test(para),
    )
      ? 0.2
      : 0;
    const length = Math.min(0.3, words / 100);
    const base = 0.4 + strong + length;
    const confidence = Math.min(0.95, base);
    if (confidence < minConfidence) continue;
    const summary = para.length > 200 ? para.slice(0, 197) + "…" : para;
    const fp = fingerprint(summary);
    intents.push({
      id: `int-${episode}-${i}`,
      summary,
      kind,
      confidence,
      sourceEpisode: episode,
      proposedCommitmentText: summary,
      fingerprint: fp,
    });
  }

  return { intents, rawParagraphs: paragraphs.length, minConfidence };
}
