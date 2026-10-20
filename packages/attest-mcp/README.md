# attest-mcp

MCP server that exposes [attest](https://github.com/bmatthews-dexcom/attest)'s 79 shell
validators, the SDLC phase-gate state machine, the `/guide` routing table, every
shared protocol, and every primary expert agent's system prompt as native
Model Context Protocol tools, resources, and prompts.

Any MCP-speaking client — Cursor, OpenCode, Claude Code, Claude Desktop — can
plug it in once and get the same attest surface, without needing attest's
install.sh to copy anything into `~/.config/opencode/`.

Design background: see `docs/attest-cursor-integration.md` in the attest-cursor
coordinator run (§6, "Primary shape"). This package is the "MCP server"
component of the layered Cursor integration — a build target generates
`.cursor/` artifacts for the editor-side surface, hooks run at tool-call time,
and `attest-mcp` carries the validators / phase gate / router that the agent
calls directly.

## What it exposes

Current inventory against attest v3.9.0: **80 tools**, **74 resources**,
**37 prompts**. Print it live:

```bash
node dist/cli.js --inventory
```

**Tools (80 total):**

- **77 validator tools** — one per `scripts/validators/validate-*.sh` (minus
  the documented exclusions below), named `validate_<id>` where `<id>` is the
  file basename with `validate-` stripped and `-` replaced by `_`
  (e.g. `validate_architecture`, `validate_owasp`, `validate_security_controls`).
  Each tool runs the shell script against a configurable `projectRoot`, parses
  the JSON envelope `_lib.sh` emits, and returns
  `{ok, exitCode, gaps, findings[], stdout, stderr, timedOut, runtimeMs, projectRoot}`.
- `phase_gate_check` — given `currentPhase` and `nextPhase`, decides whether
  the transition is allowed and what blocks it (missing prereq receipts,
  missing required files, failing validators). Wraps the 78th validator
  (`validate-phase-gate.sh`) with structured output. Optionally runs the
  target phase's validators in one call.
- `route_goal` — given a plain-English goal, returns the recommended expert
  agent + command + rationale + **invocation hint** for the matching
  `attest-experts` BDK agent (so an orchestrator can dispatch
  without a second lookup). Returns a runner-up for close matches, or defers
  to `/guide` for ambiguous goals rather than guessing.
- `list_experts` — returns the structured catalog of every primary expert
  agent (id, name, summary, cluster, invocation hint, recommended SDLC phases,
  required-tool list, prompt name, manifest URI). Supports `cluster` and
  `phase` filters.

**Resources (74 total):**

- `attest://phase-gate/state-machine` — the SDLC state machine as JSON (phases,
  prerequisites, required files, chained validators including the systemic
  challenger gate).
- `attest://routing-table` — the `/guide` routing table as JSON.
- `attest://validators/catalog` — index of every validator tool with its
  category, summary, and script path.
- `attest://experts/catalog` — the full `list_experts` payload in resource
  form, browsable by any MCP client (same data; different access surface).
- `attest://experts/<id>` — one dynamic resource per primary expert; returns
  the manifest with the **full persona prompt**, routing rationale(s) from the
  `/guide` table, invocation hint, cluster, recommended phases, and required
  tools. Consumed by `attest-experts` BDK agents to stay in sync
  with attest's source of truth. 33 experts as of attest v3.9.0.
- `attest://protocols/<slug>` — one dynamic resource per shared protocol in
  `agents/shared/*.md` (e.g. `attest://protocols/handoff-templates`,
  `attest://protocols/gate-scoring-protocol`). 37 protocols as of attest
  v3.9.0.

**Prompts (37 total):**

- `prompt_expert_<name>` — one per primary expert agent
  (`sdlc-lead`, `security-auditor`, `code-reviewer`, `performance-engineer`,
  `db-architect`, ...). Returns the agent's full system prompt verbatim so a
  client without the generated `.cursor/agents/*` files can still consume the
  persona. 33 expert prompts as of attest v3.9.0.
- `prompt_sdlc_mode_<mode>` — one per SDLC mode (`init`, `onboard`, `feature`,
  `improve`). Supports `name` and `description` template arguments for the
  `{{var}}` placeholders in attest's command bodies.

## Expert ID derivation rule

Expert ids come from attest's own filesystem. The rule is simple and stable:

> **`<id>` = attest primary agent filename minus `.md`**

Examples:

| Attest source | Expert id | Invocation hint |
|---|---|---|
| `agents/security-auditor.md` | `security-auditor` | `{ package: "attest-experts", agent: "security-auditor" }` |
| `agents/code-reviewer.md`    | `code-reviewer`    | `{ package: "attest-experts", agent: "code-reviewer" }`    |
| `agents/sdlc-lead.md`        | `sdlc-lead`        | `{ package: "attest-experts", agent: "sdlc-lead" }`        |

"Primary" means `mode: "primary"` in the agent file's YAML frontmatter.
Cluster subagents (files under `agents/code-review/`, `agents/security/`,
`agents/performance/`, `agents/game/`, `agents/sdlc/onboard/`, `agents/test/`
with `mode: "subagent"`) do not get expert entries — they are reached through
their primary. The sibling `feat/attest-experts` worker builds its BDK agents
from this same rule; `attest://experts/catalog` is the authoritative source
of truth both ends can diff against.

## Design decisions

### One tool per validator (not grouped)

The brief allowed grouping (e.g. all `security/*` into one `validate_security`
with a `category` arg), but attest's validators are **not** grouped by
directory — they are a flat `scripts/validators/validate-*.sh` set. Keeping
one MCP tool per validator:

- Matches the design report's recommendation (`attest.validate.<name>`,
  not `attest.validate(name=...)`).
- Lets Cursor's model see every validator in its tool catalog with a per-tool
  description and schema, instead of a single tool whose correctness depends on
  the model guessing the right `category` value.
- Keeps the shell contract 1:1 — a 77-element tool list is unambiguous; a
  single tool with 77 branches hides tool-level documentation behind a free-text
  parameter.

For discovery, `attest://validators/catalog` groups them by inferred category
(security, architecture, api, data, quality, testing, process, release, docs,
requirements, ux, ops, other).

### Validator exclusions

Four files in `scripts/validators/` are deliberately NOT exposed as per-tool
MCP tools:

| File | Why |
|---|---|
| `_lib.sh`, `_lib_sdlc_config.sh` | Sourced helpers, not standalone validators |
| `run-coverage-loop.sh`, `run-handoff-gates.sh` | Composite orchestrators that spawn validators themselves — exposing them via MCP would double-wrap the tool catalog; drive composition from the client by calling individual validator tools |
| `validate-phase-gate.sh` | Reserved; wrapped by the dedicated `phase_gate_check` tool with structured output |
| `validate-scope.match.test.sh` | Test harness for the matcher helper inside `validate-scope.sh`, not a validator itself |

That leaves 77 per-validator tools + `phase_gate_check` = 78 validator-related
tools, derived from attest's 79-validator surface.

### Orchestrator-first architecture (Shape 2)

The user picked an orchestrator-first integration (design report §7, "Shape 2").
`attest-experts` (sibling package, `feat/attest-experts` branch) ships
the primary expert agents as deployable BDK agents, and the attest conductor
BDK agent dispatches to them. This MCP server exposes the **discovery** surface
for that fan-out:

1. `list_experts` tells the orchestrator what agents exist.
2. `attest://experts/<id>` provides the full manifest (persona + routing +
   tools) at build or runtime.
3. `route_goal` returns an `invocation_hint` so the orchestrator can go
   straight from goal → spawn without a second lookup.
4. `phase_gate_check` + the 77 validator tools provide the enforcement layer
   the orchestrator consults between dispatches.

## Install

Not published yet. For now:

```bash
# From the attest repo:
cd packages/attest-mcp
npm install
npm run build          # bundles sources into ./bundled, compiles ./dist
node dist/cli.js --inventory
```

Once published, the standard install will be:

```bash
npx -y attest-mcp --inventory
```

## Finding attest sources at runtime

The server needs the validator scripts and protocol markdown to actually work.
Resolution order:

1. **`ATTEST_ROOT` env var** — point at a live attest checkout.
   Required for development; useful for consumers that want to track an
   unreleased attest ref.
2. **Bundled copy** — `scripts/bundle-sources.mjs` runs at `npm run build` /
   `npm pack` time and copies `scripts/validators/`, `rules/`, `agents/shared/`,
   `agents/*.md`, and `commands/*.md` into `packages/attest-mcp/bundled/`.
   This is the default `npx -y attest-mcp` path — no attest checkout
   required.

If a validator you want is missing from the bundled copy, set `ATTEST_ROOT`.

Separately, every tool accepts a `projectRoot` arg (or honours the
`ATTEST_TARGET_ROOT` env var) so you can validate repo B while the server
runs out of repo A.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `ATTEST_ROOT` | (bundled copy) | Where to read validator scripts + protocol markdown from |
| `ATTEST_TARGET_ROOT` | `process.cwd()` | Which repo validators run against (overridable per-call via `projectRoot`) |
| `EXPERTS_TELEMETRY` | `0` (forced by the server) | Forwarded to `_lib.sh` only when a tool call sets `enableTelemetry: true` |

## Client configuration

### Cursor

Add to `.cursor/mcp.json` at the project root (or the sibling
`feat/cursor-build-target` worker's generated `.cursor/` will add it for you):

```json
{
  "mcpServers": {
    "attest": {
      "command": "npx",
      "args": ["-y", "attest-mcp"],
      "env": {
        "ATTEST_TARGET_ROOT": "${workspaceFolder}"
      }
    }
  }
}
```

See the [Cursor MCP docs](https://docs.cursor.com/en/context/mcp) for the
project-level vs user-level config distinction, allowlists, and the
`beforeMCPExecution` hook matcher.

### OpenCode

Add to `~/.config/opencode/opencode.json`:

```json
{
  "mcp": {
    "attest": {
      "command": "npx",
      "args": ["-y", "attest-mcp"]
    }
  }
}
```

### Claude Code

Add to `~/.claude/mcp.json` (or `.claude/mcp.json` for project scope):

```json
{
  "mcpServers": {
    "attest": {
      "command": "npx",
      "args": ["-y", "attest-mcp"]
    }
  }
}
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "attest": {
      "command": "npx",
      "args": ["-y", "attest-mcp"]
    }
  }
}
```

## Development

```bash
# Install deps
npm install

# Rebundle sources from the sibling attest checkout
npm run bundle

# Compile TypeScript
npm run build

# Run the inspector against the built server
npm run inspect

# Point at a different attest checkout
ATTEST_ROOT=/path/to/attest npm run inspect

# Run smoke tests
npm test

# Print inventory without starting a transport
node dist/cli.js --inventory

# List every validator tool (one per line, tab-separated)
node dist/cli.js --validators
```

## Safety notes

- Every tool call runs in a child `bash` process with stdin closed, so a
  validator cannot accidentally block on a prompt.
- Every call has a 2-minute default timeout (`timeoutMs` is per-tool
  configurable).
- `EXPERTS_TELEMETRY=0` is forced on every tool call so running a validator
  via MCP never silently appends to the target repo's
  `docs/work/telemetry.jsonl`. Set `enableTelemetry: true` per-call to
  opt back in.
- No validator is interactive. Any attest validator that ever added an
  interactive prompt would need to be adapted; today none do.

## What is intentionally NOT exposed

- OpenCode-specific plugin surfaces (`plugins/expert-hooks.ts`,
  `plugins/resume-anchor.ts`) — the Cursor target ports those as `.cursor/hooks`
  scripts, not as MCP tools.
- Model-tier detection (`scripts/detect-model-context.sh`) — not meaningful on
  Cursor's frontier-only model lineup (design report §2 and §5.3).
- The `--compact` agent overlay (`dist/compact-agents/`) — same reason.
- `tools/task.ts`, `tools/write.ts`, `tools/append.ts`, `tools/update.ts` —
  LM-Studio-plus-OpenCode patches with no reason to exist on Cursor
  (design report §5.9, §6 "Drops").
- Orchestrator scripts (`validate-phase-gate.sh`, `run-coverage-loop.sh`,
  `run-handoff-gates.sh`) as validator tools — `validate-phase-gate.sh` is
  reserved as the `phase_gate_check` tool; the others are composite loops that
  are better driven by the client calling individual validator tools.
