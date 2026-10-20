# `@bpmforge/attest-ceo-mcp`

Companion MCP server for the attest **CEO** BDK agent (sibling package
`@bpmforge/attest-ceo`). Workspace-only — this package is **not published
to npm**; source lives on Bradford's personal GitHub
(`bmatthews-dexcom/attest`).

See the design doc at
[`docs/attest-ceo-architecture.md`](../../docs/attest-ceo-architecture.md)
(Shape 1 is the Phase 1 surface this package implements).

## What this exposes

### Tools

| name | shape | purpose |
|---|---|---|
| `ingest_discussion` | `{ source, text, metadata? }` | Normalize a raw discussion into a digest + heuristic intents. Does NOT dedupe (the agent owns the ledger). |
| `extract_intent` | `{ text, minConfidence? }` | Deterministic heuristic intent extractor. The agent re-runs its own LLM extractor on top. |
| `draft_plan` | `{ intent, context?, dispatchMode? }` | Produce an `awaiting-approval` plan. |
| `approve_plan` / `deny_plan` | `{ plan }` | Flip plan state. |
| `refine_plan` | `{ plan, title, rationale }` | Produce a v+1 version. |
| `dispatch_plan` | `{ plan, autonomyMode, conductorTool? }` | Return a dispatch blueprint; the agent calls the chief itself. |
| `director_create_expert` | `{ role, example_task, inputs, outputs, urgency }` | Stub — returns "director not yet deployed" unless `ATTEST_DIRECTOR_ENABLED=true` is set *and* the Director worker has swapped the stub for a real transport. |
| `roadmap_sync` | `{ ledger }` | CEO agent pushes its canonical kv ledger snapshot. |
| `roadmap_set_initiative` | `{ initiative }` | Upsert one initiative. |
| `commitments_upsert` | `{ commitment }` | Upsert one commitment. |
| `autonomy_set` | `{ mode }` | Mirror the agent's autonomy flip. |

### Resources

| URI | shape |
|---|---|
| `attest://ceo/roadmap/current` | `{ updatedAt, roadmap: Initiative[] }` |
| `attest://ceo/commitments/open` | `{ updatedAt, count, commitments: Commitment[] }` |
| `attest://ceo/decisions/log` | `{ updatedAt, decisions: Decision[] }` |
| `attest://ceo/autonomy/current` | `{ updatedAt, autonomy }` |

Resources are **readable snapshots** of the CEO agent's canonical kv
ledger. The agent is the source of truth; this server mirrors state via
the `roadmap_sync` / `*_set_*` / `*_upsert` tools.

## Local use

```sh
# Build (TypeScript → dist/)
npm --workspace @bpmforge/attest-ceo-mcp run build

# Smoke inventory (no credential needed)
node packages/attest-ceo-mcp/dist/cli.js --inventory
```

Wire into Cursor via `.cursor/mcp.json`:

```jsonc
{
  "mcpServers": {
    "attest-ceo": {
      "command": "node",
      "args": ["./packages/attest-ceo-mcp/dist/cli.js"]
    }
  }
}
```

The generator in `scripts/build-target-cursor.mjs` emits exactly this
entry when it writes `.cursor/mcp.json`.

## Shape C attest-mcp coordination

The sibling Shape C `attest-mcp` worker is landing two new read-only
resources the CEO agent consumes:

| URI | consumed by |
|---|---|
| `attest://tasks/<id>/status.json` | CEO agent reconciliation (status polling for in-flight chief tasks) |
| `attest://tasks/<id>/completion.json` | CEO agent reconciliation (closed-task evidence → commitment resolution) |

Until those resources land, `src/dispatch.ts` ships a `mockTaskStatus`
helper and the CEO agent reads a mocked completion. Both call sites
carry a `TODO(ceo): switch to real resource when attest-mcp Shape C
merges` so the swap is a one-point change.

## Deploy

- **Local**: `node packages/attest-ceo-mcp/dist/cli.js` (via the
  `.cursor/mcp.json` entry above).
- **Hosted (CEO agent only)**: the CEO BDK agent runs on Cursor's own
  hosting via `npx @cursor/bdk deploy` (needs `CURSOR_API_KEY` only;
  **not npm**). The MCP server stays local because it's a stdio child
  process the agent spawns.
