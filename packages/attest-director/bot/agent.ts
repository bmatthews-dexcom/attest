import { defineAgent } from "@cursor/bdk";

/**
 * attest-director — persistent BDK meta-agent that fills expert-pool gaps.
 *
 * Model intentionally inherits from the host (Bradford's constraint:
 * "Omit `model` — inherit my model"). All phase logic lives in
 * `bot/instructions.md` (the Ralph-shaped prompt) + the TypeScript
 * channel driver in `bot/channels/director.ts` + the Director MCP
 * connection in `bot/mcp-connections/director-mcp.ts`.
 *
 * Design doc: `docs/attest-director-architecture.md`.
 */
export default defineAgent({});
