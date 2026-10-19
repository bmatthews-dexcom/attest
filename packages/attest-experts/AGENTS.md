# attest-experts — AGENTS.md

Terse coding-agent reference for `@bpmforge/attest-experts`. Human-facing
docs live in `README.md`.

## Loop

```bash
npm --prefix packages/attest-experts run check       # tsc --noEmit
npm --prefix packages/attest-experts run validate    # bdk validate + direct bdk call tests + stub MCP smoke
npm --prefix packages/attest-experts run sync-stubs  # regenerate stubs from attest/agents/
ATTEST_MCP_STUB=1 npx bdk eval --dir packages/attest-experts/agents/<id>  # end-to-end (needs CURSOR_API_KEY)
```

Run under Node, never Bun.

## Where logic belongs

| Code owns | Model owns |
| --- | --- |
| `submit-report` schema validation + `expert_id` pin + kv/files write | which findings to lift from validator output |
| `refuse-not-ported` deterministic refusal | nothing — stubs do nothing |
| `attestMcpConnection()` stdio spawn choice (real vs stub) | which MCP tools to call in what order |
| `expertKvKey(id, task_id, suffix)` key format | all persona-level methodology |

## Layout invariants

- `agents/<id>/bot/agent.ts` **must** `defineExpert({ meta })` or
  `defineStubExpert(meta)` — nothing else. All shared config comes from the
  factory in `lib/expert-factory.ts`.
- `lib/` is **not** discovered by BDK — import-only.
- Shared tools go through factories (`submitReportTool`, `notPortedTool`),
  not duplicated per expert.
- Every stub has exactly 3 files: `agent.ts`, `instructions.md`,
  `tools/refuse-not-ported.ts`. `sync-stubs.ts` is the only writer.

## When adding or removing an expert

1. Edit `lib/expert-registry.ts :: CONCRETE_EXPERTS` for concrete experts.
2. Run `npm run sync-stubs` (regenerates `lib/experts.generated.json` and
   adds / removes stubs under `agents/`).
3. For a new concrete expert, follow the 7-step recipe in `README.md`.
4. Run `npm run check && npm run validate` before pushing.

## Coordination

- Agent ids match `attest://experts/<id>` on the sibling `@bpmforge/attest-mcp`.
- Shared input/output schema (`lib/schema.ts`) is the contract the sibling
  `@bpmforge/attest-conductor` binds to. Treat it as a published surface — do
  not break it without updating that package too.
