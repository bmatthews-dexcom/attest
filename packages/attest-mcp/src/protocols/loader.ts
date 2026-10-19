/**
 * protocols/loader.ts — read the shared-protocol markdown out of
 * agents/shared/ and project each one as an `attest://protocols/<name>`
 * MCP resource.
 *
 * We skip subdirectories (agents/shared/blocks/, agents/shared/includes/)
 * for the resource surface — those are build-time include snippets, not
 * end-user-facing protocols. If you need them, read them off disk via the
 * attest://validators/catalog resource's `attestRoot` field.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { attestRoot } from "../sources.js";

export interface ProtocolDescriptor {
  readonly name: string;
  readonly slug: string;
  readonly path: string;
  readonly uri: string;
  readonly summary: string;
}

let cached: ProtocolDescriptor[] | null = null;

function firstHeadingOrLine(text: string): string {
  for (const raw of text.split("\n").slice(0, 25)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      return line.replace(/^#+\s*/, "").trim();
    }
    if (line.startsWith("---") || line.startsWith(">")) continue;
    return line.slice(0, 200);
  }
  return "attest shared protocol";
}

export function listProtocols(): ProtocolDescriptor[] {
  if (cached) return cached;
  const dir = join(attestRoot().root, "agents", "shared");
  const out: ProtocolDescriptor[] = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (!statSync(abs).isFile()) continue;
    if (!entry.endsWith(".md")) continue;
    const name = basename(entry, ".md");
    const slug = name.toLowerCase().replace(/_/g, "-");
    let summary = "attest shared protocol";
    try {
      summary = firstHeadingOrLine(readFileSync(abs, "utf8"));
    } catch {
      /* keep default */
    }
    out.push({
      name,
      slug,
      path: abs,
      uri: `attest://protocols/${slug}`,
      summary,
    });
  }
  out.sort((a, b) => a.slug.localeCompare(b.slug));
  cached = out;
  return out;
}

export function protocolBySlug(slug: string): ProtocolDescriptor | undefined {
  return listProtocols().find((p) => p.slug === slug);
}

export function readProtocol(slug: string): string {
  const p = protocolBySlug(slug);
  if (!p) throw new Error(`unknown protocol: ${slug}`);
  return readFileSync(p.path, "utf8");
}
