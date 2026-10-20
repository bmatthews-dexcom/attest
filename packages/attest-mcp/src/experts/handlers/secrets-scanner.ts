/**
 * handlers/secrets-scanner.ts — reference in-process expert.
 *
 * Aligned with the sibling attest-experts classification manifest
 * (packages/attest-experts/lib/classification.generated.json, PR #12):
 *   id:              "secrets-scanner"
 *   cluster:         security
 *   classification:  in-process-eligible
 *   WRITE-SCOPE:     docs/security/
 *
 * The full persona runs trufflehog + a grep pattern pass across the
 * workspace and uses `git log` + `git show` to walk history. This
 * reference handler ships a smaller, deterministic implementation: a
 * regex-only scan of the current working tree. The capability spectrum
 * declared below (`read:fs` only) therefore reflects what the handler
 * actually exercises, not the full persona's eventual needs. A Phase-2
 * port that enables trufflehog + git-history scans would widen the
 * declared capabilities (and the corresponding Cedar policy).
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type {
  ExpertFinding,
  ExpertInput,
  ExpertOutput,
  InProcessExpertHandler,
} from "../types.js";
import { getLlmBackend } from "./llm.js";

const SECRET_PATTERNS: ReadonlyArray<{ name: string; regex: RegExp; severity: ExpertFinding["severity"] }> = [
  { name: "aws-access-key-id", regex: /\bAKIA[0-9A-Z]{16}\b/, severity: "critical" },
  { name: "aws-secret-access-key", regex: /\baws(.{0,20})?(secret|private).{0,5}['"][0-9a-zA-Z/+=]{40}['"]/i, severity: "critical" },
  { name: "github-personal-access-token", regex: /\bghp_[0-9A-Za-z]{36}\b/, severity: "critical" },
  { name: "slack-bot-token", regex: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/, severity: "high" },
  { name: "generic-pem-private-key", regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |)PRIVATE KEY-----/, severity: "critical" },
  { name: "stripe-live-secret-key", regex: /\bsk_live_[0-9a-zA-Z]{24,}\b/, severity: "high" },
];

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "bundled",
  ".cache",
  "coverage",
]);

const MAX_FILES = 2000;
const MAX_BYTES = 256 * 1024;

function* walk(root: string): Generator<string> {
  let count = 0;
  const stack: string[] = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (SKIP_DIRS.has(name)) continue;
      const abs = join(dir, name);
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        stack.push(abs);
      } else if (st.isFile() && st.size <= MAX_BYTES) {
        yield abs;
        count++;
        if (count >= MAX_FILES) return;
      }
    }
  }
}

export const secretsScannerHandler: InProcessExpertHandler = {
  id: "secrets-scanner",
  cluster: "security",
  persona: async () => {
    try {
      const { loadPersonaFromAttestSource } = await import("./persona.js");
      return await loadPersonaFromAttestSource("security/secrets-scanner");
    } catch {
      return (
        "You are secrets-scanner, an attest security specialist. You review " +
        "a candidate secret-pattern match list and classify each as (a) real " +
        "credential leak, (b) placeholder/dummy, or (c) false positive, then " +
        "write a short findings report. Writes synthesis to docs/security/."
      );
    }
  },
  requiredCapabilities: [{ kind: "read:fs" }],
  async invoke(input: ExpertInput): Promise<ExpertOutput> {
    const start = Date.now();
    const root = input.projectRoot || process.env.ATTEST_TARGET_ROOT || process.cwd();

    const matches: Array<{ file: string; line: number; pattern: string; severity: ExpertFinding["severity"] }> = [];
    let filesScanned = 0;
    for (const file of walk(root)) {
      filesScanned++;
      let text: string;
      try {
        text = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        for (const { name, regex, severity } of SECRET_PATTERNS) {
          if (regex.test(lines[i])) {
            matches.push({ file: relative(root, file), line: i + 1, pattern: name, severity });
          }
        }
      }
    }

    const findings: ExpertFinding[] = matches.map((m) => ({
      category: `secret:${m.pattern}`,
      severity: m.severity,
      detail: `candidate ${m.pattern} match`,
      location: `${m.file}:${m.line}`,
    }));

    const llm = getLlmBackend();
    const persona =
      typeof secretsScannerHandler.persona === "string"
        ? secretsScannerHandler.persona
        : await secretsScannerHandler.persona();
    const llmResponse = await llm.complete({
      system: persona,
      user:
        `Goal: ${input.goal}\n\n` +
        `Workspace: ${root}\n` +
        `Files scanned: ${filesScanned}\n` +
        `Candidate matches:\n${JSON.stringify(matches, null, 2)}\n\n` +
        `Classify each match and write a short findings report.`,
    });

    return {
      ok: findings.length === 0,
      expertId: "secrets-scanner",
      summary:
        matches.length === 0
          ? `scanned ${filesScanned} files, no candidate secrets found`
          : `scanned ${filesScanned} files, ${matches.length} candidate secret match(es) — review required`,
      findings,
      data: { filesScanned, matches, llmBackend: llmResponse.backend },
      transcript: llmResponse.transcript,
      runtimeMs: Date.now() - start,
    };
  },
};
