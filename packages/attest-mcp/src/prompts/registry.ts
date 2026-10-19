/**
 * prompts/registry.ts — expose attest's primary expert agents and the four
 * SDLC-mode command bodies as MCP prompts.
 *
 * Why: a client that doesn't ship the generated .cursor/agents/ files (e.g.
 * ad-hoc Claude Desktop, or a bare OpenCode install pre-attest) can still
 * fetch the agent's system prompt via MCP and either paste it or let the
 * host agent use it directly.
 *
 * Discovery is filesystem-driven. "Primary" expert agents are those with
 * `mode: "primary"` in their YAML frontmatter. SDLC mode prompts are
 * `commands/sdlc-<mode>.md` for mode in {init, onboard, feature, improve}.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { attestRoot } from "../sources.js";

export interface ExpertPromptDescriptor {
  readonly name: string;
  readonly promptName: string;
  readonly path: string;
  readonly description: string;
}

export interface SdlcModePromptDescriptor {
  readonly mode: "init" | "onboard" | "feature" | "improve";
  readonly promptName: string;
  readonly path: string;
  readonly description: string;
}

function parseFrontmatter(text: string): Record<string, string> {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  const out: Record<string, string> = {};
  if (!m) return out;
  for (const line of m[1].split("\n")) {
    if (/^\s/.test(line)) continue;
    const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return out;
}

let expertCache: ExpertPromptDescriptor[] | null = null;

export function listExpertPrompts(): ExpertPromptDescriptor[] {
  if (expertCache) return expertCache;
  const dir = join(attestRoot().root, "agents");
  const out: ExpertPromptDescriptor[] = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (!statSync(abs).isFile()) continue;
    if (!entry.endsWith(".md")) continue;
    const text = readFileSync(abs, "utf8");
    const fm = parseFrontmatter(text);
    if (fm.mode !== "primary") continue;
    const name = basename(entry, ".md");
    out.push({
      name,
      promptName: `prompt_expert_${name.replace(/-/g, "_")}`,
      path: abs,
      description:
        fm.description ||
        `${name} — attest primary expert agent (see agents/${entry})`,
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  expertCache = out;
  return out;
}

export function expertPromptByName(
  promptName: string,
): ExpertPromptDescriptor | undefined {
  return listExpertPrompts().find((p) => p.promptName === promptName);
}

export function readExpertPrompt(desc: ExpertPromptDescriptor): string {
  return readFileSync(desc.path, "utf8");
}

const SDLC_MODES: SdlcModePromptDescriptor["mode"][] = [
  "init",
  "onboard",
  "feature",
  "improve",
];

let sdlcCache: SdlcModePromptDescriptor[] | null = null;

export function listSdlcModePrompts(): SdlcModePromptDescriptor[] {
  if (sdlcCache) return sdlcCache;
  const dir = join(attestRoot().root, "commands");
  const out: SdlcModePromptDescriptor[] = [];
  for (const mode of SDLC_MODES) {
    const abs = join(dir, `sdlc-${mode}.md`);
    try {
      const text = readFileSync(abs, "utf8");
      const fm = parseFrontmatter(text);
      out.push({
        mode,
        promptName: `prompt_sdlc_mode_${mode}`,
        path: abs,
        description:
          fm.description ||
          `SDLC mode ${mode} — attest canonical command body (commands/sdlc-${mode}.md)`,
      });
    } catch {
      /* skip missing modes rather than crash — attest may add/remove */
    }
  }
  sdlcCache = out;
  return out;
}

export function sdlcModePromptByName(
  promptName: string,
): SdlcModePromptDescriptor | undefined {
  return listSdlcModePrompts().find((p) => p.promptName === promptName);
}

export function readSdlcModePrompt(desc: SdlcModePromptDescriptor): string {
  return readFileSync(desc.path, "utf8");
}
