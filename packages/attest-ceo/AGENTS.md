# attest-ceo

Bot Development Kit (BDK) project (`@cursor/bdk`). This file is for
coding agents editing the project. The served agent's prompt is
`bot/instructions.md`.

## Loop

```bash
cd packages/attest-ceo
npx tsc --noEmit                    # strict typecheck
   10|npm test                            # tsc + node --test (ceo-state, ceo-loop)
npx @cursor/bdk validate --dir .    # BDK diagnostic pass
npx @cursor/bdk info --dir . --json # tool / channel catalog
npx @cursor/bdk eval --dir . --list # confirm all 5 evals register
```

Run the CLI under Node, never Bun.

## Layout

   20|- `bot/instructions.md` is the always-on prompt. Keep it short.
- `bot/tools/<name>.ts` is one tool per file. The filename is the tool
  name. The chat command `/ceo <sub>` is routed by the agent to the
  matching `ceo_<sub>` tool from the prompt.
- `bot/lib/` is shared code. Not discovered by BDK; imported by tools.
- `bot/mcp-connections/<slug>.ts` wires each MCP connection; `slug` is
  the server name agents use to call `host.mcp.callTool(slug, …)`.
- `bot/schema.ts` is the zod source of truth for the ledger shape.
- `evals/` is filesystem evals (`evals/evals.config.ts` required).
  Not `bot/evals/`. That path is ignored.
   30|- `test/*.test.mjs` runs under `node --import tsx --test` so test files
  can import `../bot/lib/*.ts` directly.

## Memory rules

- All durable state goes through `ctx.host.kv` under `ceo:*`. Never a
  module-level `let` or an on-disk cache. BDK framework invariant 7
  (serve host may be replaced between turns).
- `bot/lib/ceo-state.ts` has read-modify-write helpers; always use them
  so mirror keys stay in sync.
   40|- Every mutating tool takes an `actionId` input (defaulted via
  `randomUUID()`). Idempotency is enforced by the ledger's
  decision/plan/task shape — a duplicate call lands on an already-up-to
  date record and is a no-op.

## MCP rules

- The three MCP connections (`attest-ceo-mcp`, `attest-conductor`,
  `attest`) each ship with an inline stub keyed off a `*_COMMAND` env
  var. Default (no env): stub. Setting `ATTEST_<X>_COMMAND` spawns the
   50|  real stdio server. Keep the stub implementations trivially correct
  by delegating to the real package source (same `draftPlan`,
  `extractIntents`, etc.).
- Never gate tests or evals on a credential. The stubs exist so the
  Phase 1 loop runs offline.

## Do not

- Grow host TypeScript for formatting, classification, or reply
  composition. That stays in `instructions.md` + the stub /
  attest-ceo-mcp heuristics. Host code owns kv, idempotency, dispatch,
   60|  and reconciliation plumbing.
- Add npm deps on a first cut. Stick to `@cursor/bdk` + `zod` +
  `attest-ceo-mcp` (workspace sibling).
- Publish to npm. This package is `"private": true` by policy — source
  stays on `bmatthews-dexcom/attest`; the Director's downstream expert
  deploys use `npx @cursor/bdk deploy` with `CURSOR_API_KEY`, not npm.
- Point `serve` at a parent folder during bring-up. It mounts every
  sibling.

## Pointers

   70|- Package loop: `node_modules/@cursor/bdk/AGENTS.md`
- Skills: `node_modules/@cursor/bdk/skills/` (`create-agent`, `deploy`,
  `evals`, `hillclimb`, `debug`)
- Docs: `npx @cursor/bdk docs`
- Sibling: `packages/attest-ceo-mcp/README.md`
- Sibling: `packages/attest-conductor/README.md` (the chief)
- Design doc: `/cursor/stores/.../docs/attest-ceo-architecture.md`
