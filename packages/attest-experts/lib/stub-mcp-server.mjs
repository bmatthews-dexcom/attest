#!/usr/bin/env node
/**
 * attest-mcp STUB — a minimal stdio MCP server used in evals / bring-up when
 * the sibling `@bpmforge/attest-mcp` package is not available.
 *
 * Deterministic fixtures only; see `lib/attest-mcp.ts` for how it is wired
 * into each expert's `bot/mcp-connections/attest.ts`.
 *
 * Enabled by `ATTEST_MCP_STUB=1`. Production serve uses the real package.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const HERE = dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = resolve(HERE, "experts.generated.json");

let registry = [];
try {
  registry = JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
} catch {
  // Registry missing (fresh checkout without `sync-stubs`); the server still
  // starts and reports an empty catalog.
}

function manifestForId(id) {
  return registry.find((e) => e.id === id);
}

const server = new McpServer(
  { name: "attest-mcp-stub", version: "0.0.0" },
  { capabilities: { tools: {} } },
);

server.registerTool(
  "get_expert_manifest",
  {
    description:
      "Return the attest manifest row for an expert id, including cluster and summary.",
    inputSchema: { expert_id: z.string().min(1) },
  },
  async ({ expert_id }) => {
    const row = manifestForId(expert_id);
    if (!row) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ok: false,
              error: `unknown expert_id: ${expert_id}`,
              known: registry.map((e) => e.id),
            }),
          },
        ],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify({ ok: true, manifest: row }) }],
    };
  },
);

server.registerTool(
  "get_persona",
  {
    description:
      "Return the persona markdown for an expert (fetched from `attest://experts/<id>` in production).",
    inputSchema: { expert_id: z.string().min(1) },
  },
  async ({ expert_id }) => {
    const row = manifestForId(expert_id);
    if (!row) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ ok: false, error: `unknown expert_id: ${expert_id}` }),
          },
        ],
        isError: true,
      };
    }
    const persona = [
      `# ${expert_id} (stub persona)`,
      "",
      row.summary,
      "",
      `Full persona lives at ${row.source} in the attest repo and is served live by @bpmforge/attest-mcp.`,
    ].join("\n");
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ ok: true, expert_id, source: row.source, persona }),
        },
      ],
    };
  },
);

server.registerTool(
  "get_protocol",
  {
    description:
      "Return a shared attest protocol (BOUNDED_TASK_CONTRACT, GATE_SCORING_PROTOCOL, …). Stub returns a placeholder.",
    inputSchema: { name: z.string().min(1) },
  },
  async ({ name }) => ({
    content: [
      {
        type: "text",
        text: JSON.stringify({
          ok: true,
          name,
          body: `# ${name} (stub)\n\nSee agents/shared/${name}.md in the attest repo.`,
        }),
      },
    ],
  }),
);

server.registerTool(
  "list_validators",
  {
    description:
      "List the attest validators available for this expert. Stub returns a small canonical slice.",
    inputSchema: {},
  },
  async () => ({
    content: [
      {
        type: "text",
        text: JSON.stringify({
          ok: true,
          validators: [
            { name: "semgrep", cluster: "security" },
            { name: "secrets-scan", cluster: "security" },
            { name: "dependency-audit", cluster: "security" },
            { name: "lint", cluster: "code-review" },
            { name: "typecheck", cluster: "code-review" },
            { name: "tech-stack", cluster: "code-review" },
            { name: "landscape", cluster: "onboarding" },
          ],
        }),
      },
    ],
  }),
);

server.registerTool(
  "run_validator",
  {
    description:
      "Run one attest validator against a target path and return its JSON gap envelope. Stub returns a canned PASS.",
    inputSchema: { name: z.string().min(1), target: z.string().min(1) },
  },
  async ({ name, target }) => ({
    content: [
      {
        type: "text",
        text: JSON.stringify({
          ok: true,
          validator: name,
          target,
          status: "pass",
          gaps: [],
          raw: `[stub] ${name} against ${target}: PASS (deterministic fixture)`,
        }),
      },
    ],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
