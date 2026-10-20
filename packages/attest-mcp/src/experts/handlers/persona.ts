/**
 * experts/handlers/persona.ts — load an expert's persona markdown from the
 * attest source tree the server is bound to.
 *
 * Handlers that want to feed the attest persona straight into an LLM call
 * (the common case) use this helper rather than re-reading from the
 * expert registry: it short-circuits to the ATTEST_ROOT or bundled copy
 * resolution already done by `sources.ts`, so a sibling worker that sets
 * ATTEST_ROOT=/path/to/my-fork sees that fork's personas without any
 * handler-side configuration.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { attestRoot } from "../../sources.js";

/**
 * Return the full markdown of `agents/<id>.md` under the active attest
 * source tree, including YAML frontmatter.
 *
 * Throws if the file is missing — persona-fetching is never the right place
 * to swallow a bad id, since a silent empty persona would blow up the
 * LLM prompt down the line.
 */
export async function loadPersonaFromAttestSource(id: string): Promise<string> {
  const root = attestRoot().root;
  const path = join(root, "agents", `${id}.md`);
  try {
    return readFileSync(path, "utf8");
  } catch (err) {
    throw new Error(
      `attest-mcp handler: persona not found for expert "${id}" at ${path} ` +
        `(${(err as Error).message})`,
    );
  }
}
