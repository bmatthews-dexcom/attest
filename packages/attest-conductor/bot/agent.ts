import { defineAgent } from "@cursor/bdk";

/**
 * attest conductor — Phase 2 skeleton.
 *
 * The real behavior lives in `bot/instructions.md` (prompt that drives the
 * ASSESS → DECIDE → DELEGATE → VALIDATE → GATE loop), the attest-mcp
 * connection (routing / validators / gates), and the conductor-state server
 * tools (iteration counter, phase, findings — persisted in `ctx.host.kv`).
 *
 * Model is intentionally left to the hosting Cursor default. The design
 * report drops OpenCode's tier detection — Cursor's chosen model is always
 * frontier-grade.
 */
export default defineAgent({});
