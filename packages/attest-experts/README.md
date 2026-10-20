# `attest-experts`

BDK pack that ships each primary attest expert as its own deployable Cursor
cloud agent. The companion [`attest-conductor`](../attest-conductor)
dispatches to these experts dynamically; the companion
[`attest-mcp`](../attest-mcp) provides the validators, phase gate,
and persona resources every expert pulls from.

> **Why BDK, not `.cursor/agents/`?** See the design report
> [`docs/attest-cursor-integration.md`](../../docs/attest-cursor-integration.md)
> §6: the editor-side surface stays rules + hooks + MCP (handled by the
> sibling cursor build-target package), while the dispatchable expert
> personas live as `defineAgent` so the conductor can run them as cloud
> subagents, deploy them individually, and bind them to the attest validator
> catalog over MCP.

## Layout

```
packages/attest-experts/
  package.json                      attest-experts
  tsconfig.json
  AGENTS.md                         (coding-agent handoff; terse loop ref)
  lib/                              Shared code — NOT discovered by BDK
    schema.ts                       expert input/output zod schemas (shared contract)
    expert-registry.ts              Hand-authored list of concrete experts
    expert-factory.ts               `defineExpert` + `defineStubExpert`
    submit-report-tool.ts           Shared `submit-report` tool factory
    not-ported-tool.ts              Shared `refuse-not-ported` tool factory
    attest-mcp.ts                   `attestMcpConnection()` — real stdio or stub
    stub-mcp-server.mjs             Bundled stub MCP server (deterministic)
    instructions.ts                 Shared instruction templates for stubs
    experts.generated.json          Full registry — regenerated via sync-stubs
  agents/
    <expert-id>/
      bot/
        agent.ts                    defineExpert(...) or defineStubExpert(...)
        instructions.md             Short intake + grounding + methodology
        tools/
          submit-report.ts          (concrete) or refuse-not-ported.ts (stub)
        mcp-connections/
          attest.ts                 (concrete) attestMcpConnection()
      evals/                        (concrete only)
        evals.config.ts
        smoke.eval.ts
  scripts/
    sync-stubs.ts                   Enumerate attest/agents/, regenerate stubs
    validate-all.mjs                Key-free smoke verification
```

Each `agents/<expert-id>/` is an **independently deployable BDK agent**: run
`bdk deploy --dir packages/attest-experts/agents --all` to deploy every
expert as its own Cursor cloud agent slug, or pass `--slug <expert-id>` to
deploy just one.

## Composition choice — multi-agent, not one-file-per-expert dispatcher

The BDK surface supports two shapes for "many experts in one project":

1. **Multi-agent layout** — each expert is its own `bot/` subtree under a
   parent dir, deployed and addressed by slug. `bdk serve --dir agents` mounts
   them all at `/<slug>/v1/*`. This is what this pack uses.
2. **Single-root dispatcher** — one `bot/agent.ts` keys off an expert id and
   routes.

We picked (1) because the task spec requires each expert to be *individually
deployable* as a Cursor cloud agent. Multi-agent lets the conductor address
each expert by its own HTTP slug and (in BDK terms) connect to it as a
`defineConnection({ agent: "<expert-id>" })` peer. Shared infrastructure
lives in `lib/` and is imported by every expert's `bot/agent.ts`.

## Invocation contract (what the conductor sends)

Experts are invoked by `t.send(JSON.stringify(input))` where `input` matches
`lib/schema.ts :: expertInputSchema`:

```ts
{
  task_id:        string;             // conductor-assigned
  goal:           string;             // natural-language intent
  current_phase:  string;             // attest SDLC phase id
  context_refs:   string[];           // paths / urls to ground on
  prior_findings: Array<{ expert: string; summary: string; artifact?: string; severity?: ... }>;
  constraints:   {
    max_findings?:        number;
    max_runtime_seconds?: number;
    write_scope?:         string[];   // paths the expert is allowed to write
  }
}
```

The expert finishes by calling its `submit-report` tool with
`expertOutputSchema` (minus `expert_id`, which the server pins):

```ts
{
  task_id:              string;
  findings:             Finding[];      // id, severity, title, evidence, [fix, effort, module]
  suggested_next_phase: string | null;  // attest phase id or null
  blockers:             string[];       // evidence-cited reasons work could not complete
  artifacts:            ArtifactRef[];  // { path, description, kind }
  done:                 boolean;
  summary:              string;         // one-paragraph user-facing summary
}
```

The tool's `execute`:

- validates against `expertOutputSchema` (returns `{ ok: false, issues }` on fail),
- pins `expert_id` server-side so a model cannot spoof it,
- writes to `ctx.host.kv` at `attest/experts/<id>/<task_id>/report.json`,
- writes to `ctx.host.files` with deployment scope + `partition = task_id`,
  so the conductor can read it from a different session.

See `lib/schema.ts` for the authoritative zod definitions — those are the
single source of truth, imported by `attest-conductor` as well.

## Phase 1 — three concrete experts

Picked to span the clusters per the design report:

| id | cluster | why | source |
|----|---------|-----|--------|
| `security-auditor` | security | hard tool allowlist, runs validators heavily | `agents/security-auditor.md` |
| `code-reviewer`    | code-review | reads a diff, produces findings, no writes | `agents/code-reviewer.md` |
| `landscape-mapper` | onboarding | reads unfamiliar codebase, produces orientation report | `agents/sdlc/onboard/landscape-mapper.md` |

Each concrete expert ships `bot/instructions.md` (short intake + grounding +
summarized methodology), `bot/tools/submit-report.ts`, and
`bot/mcp-connections/attest.ts`. The persona is **not inlined** —
`instructions.md` tells the agent to call `get_persona({ expert_id })` on
`attest-mcp` as its first grounding step, which keeps the full persona in sync
with `agents/<id>.md` in the attest repo (served live by `attest-mcp`).

### Deviation note on "fetches persona at construction time"

The task spec says "fetches its persona prompt from the MCP resource at
construction time rather than inlining". BDK's `defineAgent` is synchronous,
so the real "construction time" of `agent.ts` cannot do an async MCP call. We
read it **per-session, as the first instruction**, which has the same
practical effect (always-fresh persona from attest source) without a startup
hazard. Documented here so the conductor worker and future readers do not
chase a different implementation.

## Phase 2 — 81 scaffold-only stubs

Every other expert file under `attest/agents/` is wired up as a loadable BDK
agent so the conductor's dispatch surface is complete, but refuses execution:

- `bot/agent.ts` → `defineStubExpert(META)` — identical shape as concrete,
  marked with `TODO Phase 2: full persona port + eval`.
- `bot/instructions.md` → "call `refuse-not-ported({ task_id })` immediately".
- `bot/tools/refuse-not-ported.ts` → returns
  `{ ok: false, status: "not_ported", expert_id, task_id, message }`.

The conductor can detect this with a single check on the tool result. See
`lib/experts.generated.json` for the full id surface (regenerated via
`npm run sync-stubs`).

## How the conductor spawns experts

The pack is agnostic to the dispatch mechanism — the shared schema and the
per-expert id surface are what the conductor binds to. Three shapes work:

1. **Deployed cloud agents** (recommended for parallelism): each expert runs
   as its own Cursor cloud agent at `https://.../bdk/<expert-id>/v1/*`. The
   conductor POSTs a session with the JSON input, polls, reads
   `ctx.host.files` for the structured report.
2. **In-process peer** (`defineConnection({ agent: "<expert-id>" })`): the
   conductor is a BDK project mounted alongside the experts, uses the peer
   MCP ask/call_tool surface.
3. **Local subagent of the conductor**: the conductor copies the expert's
   `bot/` dir into `bot/subagents/<id>/` and dispatches via the `Task` built-in.

The sibling `attest-conductor` worker owns the final choice; this pack
exposes everything they need (expert ids, HTTP slugs, shared schema).

## How to add a new expert port

1. Add a row to `lib/expert-registry.ts :: CONCRETE_EXPERTS` with the id,
   source path, cluster, and summary.
2. Create `agents/<id>/bot/agent.ts`:
   ```ts
   import { defineExpert } from "../../../lib/expert-factory.js";
   import { CONCRETE_EXPERTS } from "../../../lib/expert-registry.js";

   const META = CONCRETE_EXPERTS.find((e) => e.id === "<id>")!;
   export default defineExpert({ meta: META });
   ```
3. Write `agents/<id>/bot/instructions.md` (intake + grounding + methodology
   summary — persona itself stays authoritative in attest source).
4. Add `agents/<id>/bot/tools/submit-report.ts` and
   `agents/<id>/bot/mcp-connections/attest.ts` (both one-liners).
5. Add `agents/<id>/evals/evals.config.ts` + `smoke.eval.ts` (one end-to-end
   case that asserts `t.calledTool("submit-report")`).
6. Run `npm run sync-stubs` to refresh `experts.generated.json` and remove
   the now-redundant stub for this id.
7. Run `npm run validate` (key-free) and `npm run eval` (needs
   `CURSOR_API_KEY` or `bdk login`).

## How to run the evals

```bash
# Key-free verification: validate + direct tool calls + stub MCP smoke
npm --prefix packages/attest-experts run validate

# Full eval requires a Cursor credential; set the stub flag so the real
# `attest-mcp` package is not needed:
ATTEST_MCP_STUB=1 npx bdk eval --dir packages/attest-experts/agents/security-auditor
ATTEST_MCP_STUB=1 npx bdk eval --dir packages/attest-experts/agents/code-reviewer
ATTEST_MCP_STUB=1 npx bdk eval --dir packages/attest-experts/agents/landscape-mapper

# Point at the real sibling MCP (once published):
npx bdk eval --dir packages/attest-experts/agents/security-auditor
# or override the stdio command:
ATTEST_MCP_COMMAND=node \
ATTEST_MCP_ARGS="/path/to/attest-mcp/dist/server.js" \
npx bdk eval --dir packages/attest-experts/agents/security-auditor
```

## Deploy

Each expert deploys as its own Cursor cloud agent slug via the BDK CLI (see
`npx bdk deploy --help` and the deploy skill at
`node_modules/@cursor/bdk/skills/deploy/SKILL.md`):

```bash
# One expert
npx bdk deploy \
  --dir packages/attest-experts/agents/security-auditor \
  --slug security-auditor \
  --repo <this-repo-url> --ref feat/attest-experts

# Every expert, concrete + stub
npx bdk deploy --dir packages/attest-experts/agents --all \
  --repo <this-repo-url> --ref feat/attest-experts
```

Secrets each expert expects on its deployed pod:

- `ATTEST_MCP_COMMAND` + `ATTEST_MCP_ARGS` (optional) — override the stdio
  command used to spawn `attest-mcp`.

Egress allowlist (`hosting.egressDomains` in `defineExpert`):
`api.anthropic.com`, `api.openai.com`, `api.cursor.com`,
`registry.npmjs.org`, `github.com`, `raw.githubusercontent.com`,
`api.github.com`, `objects.githubusercontent.com`.

## Coordination with sibling workers

| id | branch | status |
|----|--------|--------|
| cursor build-target (rules + hooks + mcp.json; no personas) | `feat/cursor-build-target` | separate worker |
| `attest-mcp` (validators + state machine + persona resources) | `feat/attest-mcp` | separate worker |
| `attest-experts` (**this pack**) | `feat/attest-experts` | here |
| `attest-conductor` (dispatches to experts) | `feat/attest-conductor-bdk` | separate worker |

**Agent id contract:** kebab-case of the attest source filename (e.g.
`agents/security-auditor.md` → `security-auditor`). The sibling `attest-mcp`
worker exposes `list_experts` and `attest://experts/<id>` with the SAME ids —
no mapping, no rename. If a Phase 2 port needs a different id, document the
override in `lib/expert-registry.ts :: ExpertMetadata.id` and surface it to
the conductor via the generated registry.
