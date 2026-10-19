/**
 * `defineExpert` — the shared factory every concrete expert's `bot/agent.ts`
 * calls. Produces a configured `AgentConfigDefinition` that:
 *
 *   - names the expert in `description` so the conductor can list and pick,
 *   - defaults to the fast reviewer model but allows per-expert override,
 *   - declares the egress / secret surface for managed deployment,
 *   - leaves `instructions.md` + `tools/` + `mcp-connections/` to filesystem
 *     discovery (BDK invariant).
 *
 * The companion `defineStubExpert` returns the stub shape.
 */
import { defineAgent, type AgentConfigDefinition, type ModelSetting } from "@cursor/bdk";

import type { ExpertMetadata } from "./expert-registry.js";

export interface ExpertAgentOptions {
  /** Registry row describing this expert. */
  meta: ExpertMetadata;
  /** Model override. Default: Composer 2.5 fast (good reviewer tier). */
  model?: ModelSetting;
  /** Fallbacks if `model` is unavailable (empty = platform default handling). */
  fallbacks?: readonly ModelSetting[];
  /** Extra description to append after the summary (e.g. mode hints). */
  descriptionAddendum?: string;
}

const DEFAULT_MODEL: ModelSetting = {
  id: "composer-2.5",
  params: [{ id: "fast", value: "true" }],
};

const DEFAULT_FALLBACKS: readonly ModelSetting[] = [
  { id: "composer-2.5" },
  { id: "gpt-5.2", params: [{ id: "effort", value: "medium" }] },
];

const EGRESS_DOMAINS = [
  "api.anthropic.com",
  "api.openai.com",
  "api.cursor.com",
  "registry.npmjs.org",
  "github.com",
  "raw.githubusercontent.com",
  "api.github.com",
  "objects.githubusercontent.com",
];

export function defineExpert(options: ExpertAgentOptions): AgentConfigDefinition {
  const { meta, model, fallbacks, descriptionAddendum } = options;
  const description = descriptionAddendum
    ? `${meta.summary} — ${descriptionAddendum}`
    : meta.summary;

  return defineAgent({
    name: `attest-expert-${meta.id}`,
    description,
    model: model ?? DEFAULT_MODEL,
    fallbacks: fallbacks ?? DEFAULT_FALLBACKS,
    hosting: {
      egressDomains: EGRESS_DOMAINS,
      secretNames: ["ATTEST_MCP_COMMAND", "ATTEST_MCP_ARGS"],
    },
    concurrency: { maxRunningTurns: 4 },
  });
}

export function defineStubExpert(meta: ExpertMetadata): AgentConfigDefinition {
  return defineAgent({
    name: `attest-expert-${meta.id}`,
    description: `[stub — not yet ported] ${meta.summary}`,
    model: DEFAULT_MODEL,
    hosting: {
      egressDomains: EGRESS_DOMAINS,
    },
    concurrency: { maxRunningTurns: 1 },
  });
}
