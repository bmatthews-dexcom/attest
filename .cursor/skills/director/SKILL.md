---
name: director
description: Use when the user needs a NEW attest expert (one that doesn't yet exist in the private or shared pool) authored, evaluated, and deployed. Director handles the full 6-phase lifecycle — gap detection, research, draft, eval, approve + deploy, monitor + refine — through the `attest-director-mcp` tool surface. Trigger phrases include "create an expert for …", "we need a <role> expert", "Director, draft an expert …", "/director create …", or any CEO handoff mentioning `director.create_expert`. Do NOT trigger this skill for routine tasks that an existing expert already covers; call `route_goal` on `attest-mcp` or `invoke_expert` directly instead.
---

# Director — expert-creation skill

Director is the persistent meta-agent that fills gaps in the attest expert
pool on demand. This skill is the EDITOR front door for calling it from
Cursor: when a session needs capabilities none of the current experts
offer, Director runs the 6-phase lifecycle, surfaces a Phase-5 approval
card to Bradford, and (on approval) hot-registers a new in-process
handler, writes a `.cursor/skill`, or deploys a sandbox BDK agent.

The authoritative design is `docs/attest-director-architecture.md`
(design doc §1-§14). This skill is a **recommended-mcp-servers.json**
seed + a short "how to use Director" cheat sheet. The agent persona
lives in `.cursor/agents/director.md`.

## Hard rules (never override)

1. **Local-only distribution.** Director must never run an npm registry
   publish, auto-install any workspace-scoped package via `npx --yes`,
   or any registry push. The fence inventory
   (§6.3) locks `publish:npm` into the forbid tier; the MCP server
   re-asserts this at every publish-shaped tool. Promotion from
   `experts-private/` → `packages/attest-experts/` goes through a PR
   on `bmatthews-dexcom/attest`, not npm.

2. **Phase 1 autonomy mode is `draft-and-approve` only.** Every expert
   surfaces an explicit Phase-5 approval card before deploy. The only
   configured hook is `director:core.auto-for-repeat-role` (default
   `false`); flipping it requires explicit MCP elicitation and leaves
   a decision receipt in `director:decisions:*`.

3. **CEO contract is frozen.** The `director.create_expert` /
   `director.on_expert_deployed` tools and the
   `attest-director://briefs/<id>/completion.json` resource shape
   must stay structurally identical to the CEO's mirror
   (`attest-ceo-mcp/src/schema/director-handoff.ts`). Do not loosen or
   rename.

4. **One-way info flow with CEO and chief.** Director reads from them;
   it never writes into their kv namespaces. The MCP policy evaluator
   enforces this with `edit:ceo-namespace` and `edit:chief-namespace`
   in the forbid tier.

## When Cursor should load this skill

Load `director` when ALL of the following are true:

- The user wants a NEW expert created (not an invocation of an existing
  one). Phrases: "we need a …", "author a …", "spin up an expert that
  …", "Director, make me …", or a slash command starting with
  `/director create`.
- The expert does not already exist. Run `director.proximity_check`
  first (via the agent's own tool palette) if the user's phrasing
  overlaps with an existing expert's mission; close matches route to
  rename-and-dispatch (§4.7) instead of creating a dup.
- The autonomy flip the user is asking for is `draft-and-approve` with
  or without the `auto-for-repeat-role` hook — any other mode is a
  Phase-1 rejection (surface the fence, do not silently coerce).

Do NOT load this skill for:

- Running an EXISTING expert (that's `invoke_expert` on `attest-mcp`).
- Routing a user goal to the right expert (that's `route_goal`).
- SDLC autopilot / conductor work (that's `attest-conductor`).

## Slash-command cheat sheet (chat channel)

Every verb is parsed by `packages/attest-director/bot/lib/commands.ts`
and routed to a single Director tool.

| User types | Tool | Effect |
| --- | --- | --- |
| `/director` | `director_show_help` | Prints this cheat sheet in-channel. |
| `/director status [<id>]` | `director_status` | Lists open briefs; with an id, drills into one brief / expert / refinement. |
| `/director create <role> [--urgency urgent] [--example <path>]` | `director_create_expert` | Opens Phase 1 for a new role brief. |
| `/director approve <id>` | `director_approve` | Resolves a Phase-5 approval card. |
| `/director deny <id> [--reason "…"]` | `director_deny` | Rejects a Phase-5 approval card. |
| `/director sweep [<expert>]` | `director_sweep` | Runs Phase-6 refinement check; scoped to one expert when named. |
| `/director refine <expert> [--reason "…"]` | `director_refine_request` | Opens a new refinement cycle. |
| `/director set-autonomy draft-and-approve [auto-for-repeat-role=true\|false]` | `director_set_autonomy` | Flips the `auto-for-repeat-role` hook. Requires explicit MCP elicitation to turn on. |

GitHub channel surfaces the same verbs plus `/approve` and `/deny` as
reply shortcuts to a Director-posted approval comment. See
`packages/attest-director/bot/channels/github.ts`.

## Recommended MCP servers (editor seed)

When Cursor asks "which MCP servers should I enable?", recommend the
single Director entry. Shape-C adds `attest`, `attest-conductor`, and
`attest-policy-dev`, but those live on their own feature branches and
are out of scope for `feat/attest-director`.

```json
{
  "recommended": [
    {
      "name": "attest-director-mcp",
      "description": "Director's tool surface — role-brief intake, Phase 1-6 helpers, Cedar policy evaluation, HITL approvals, local-only expert promotion.",
      "command": "node",
      "args": ["./packages/attest-director-mcp/dist/cli.js"],
      "env": { "ATTEST_DIRECTOR_KV_ROOT": "./.attest-director-local/kv" },
      "setup": [
        "cd packages/attest-director-mcp && npm install && npm run build"
      ],
      "notes": [
        "Local-only; private package. Never spawned via `npx --yes attest-director-mcp` — resolve from workspace build."
      ]
    }
  ]
}
```

## 6-phase lifecycle (quick orient)

1. **Detect gap** — CEO calls `director.create_expert({ brief })` or
   Bradford types `/director create <role>`. Director writes the brief
   to `director:role-briefs:<id>` and runs
   `director.proximity_check` against the known expert catalog.
2. **Research** — Director reads docs, probes integrations, and writes
   `director:role-briefs:<id>:research`. The research step uses only
   always-granted capabilities (read:web, shell:safe).
3. **Draft** — Director writes a persona, zod schema, capability map,
   and fixtures under `director:drafts:<briefId>:v<n>`.
4. **Eval** — LLM-as-judge (GLIDER shape) scores drafts against the
   `golden_set`. Bar: 0.80. Three-attempt redraft cap before parking
   the brief.
5. **Approve + deploy** — Director surfaces an approval card to
   Bradford via MCP elicitation OR a GitHub comment on the originating
   PR / issue. On approval: writes `director:experts:<id>`,
   registers the private manifest, hot-registers with attest-mcp (if
   wired), and writes `attest-director://briefs/<id>/completion.json`
   so the CEO can reconcile.
6. **Monitor + refine** — Monday 09:00 UTC cron (
   `bot/schedules/sweep.ts`) scans deployed experts for drift. If
   drift is detected, Director opens a refinement cycle (same Phase
   3-5 shape, routed through `director_refine_request`).

## Fence summary (§6)

- **Always granted**: `read:web`, `read:tenant-store`,
  `write:tenant-store:director-namespace`, `write:draft-artifact`,
  `shell:safe`, `shell:safe:local-install`,
  `read:classification-manifest`,
  `write:classification-manifest:private`,
  `register:attest-mcp:director-namespace`, `request:approval`,
  `invoke:eval-judge`.
- **Ask each**: `edit:.cursor/mcp.json`,
  `write:workspace:cursor-skills`, `cursor-deploy`, `push:personal-gh`,
  `pr:open:local-attest-repo`, `spawn:subagent`.
- **Never**: `publish:npm`, `write:customer-source`,
  `edit:ceo-namespace`, `edit:chief-namespace`,
  `edit:deployed-persona-live`, `delete:deployed-expert`,
  `read:secrets`, `write:credentials`, `shell:destructive`,
  `install:npm-package-globally`, `run-arbitrary:spawned-expert`.

## HITL transport selection

Director prefers the GitHub comment-approve paper trail for `pr:*`
and `publish:*` capability asks whenever a GitHub binding is present.
For `edit:.cursor/mcp.json`, `write:workspace:cursor-skills`,
`cursor-deploy`, and `spawn:subagent`, Director prefers MCP
elicitation. When neither transport is wired for a destructive
capability, Director fails closed with `no_hitl_transport` — never
silently proceeds.

## Where to go next

- Design doc: `docs/attest-director-architecture.md` §1-§14.
- Agent persona: `.cursor/agents/director.md`.
- MCP server: `packages/attest-director-mcp/`.
- BDK agent: `packages/attest-director/`.
- CEO contract: `packages/attest-director/bot/lib/ceo-contract.ts`.
