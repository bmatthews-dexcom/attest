---
name: invoke-attest-conductor
description: 'Route a long-running / multi-expert / unattended attest task (autopilot, SDLC phases, fan-out code review, security audits that need multiple personas) to the attest conductor BDK agent. Use whenever the user asks for /sdlc, /security, /autopilot, /review, or any multi-persona workflow — Cursor itself does not host those personas (they live in @bpmforge/attest-experts).'
disable-model-invocation: true
---

<!--
  attest-cursor skill — orchestrator-first architecture.
  Expert personas live in @bpmforge/attest-experts, orchestrated by
  @bpmforge/attest-conductor. This skill is the LOCAL Cursor side's
  "dial out" to that orchestrator.
-->

# invoke-attest-conductor

The local Cursor Agent is a thin editor-time veneer; the attest expert
personas (security-auditor, code-reviewer, sdlc-lead, ux-engineer, …) run
as BDK agents in **@bpmforge/attest-experts**, orchestrated by
**@bpmforge/attest-conductor**. This skill teaches you to invoke that
orchestrator rather than attempting to run the persona workflow inline
(which would silently drop the HANDOFF plumbing, gate scoring, delegation
log, and multi-model review).

## When to use

Invoke the conductor whenever the user asks for anything that would, on
OpenCode, have gone through `sdlc-lead` or any of the primary expert
agents. Natural-language triggers:

- "run /sdlc init / onboard / feature / improve …"
- "do a full security audit"
- "review this change" (multi-pass / cross-expert)
- "run autopilot" / "finish the board"
- "ship a release" / "cut v1.2.3"
- Anything that reads like an attest slash command but is not a technique
  skill present under `.cursor/skills/`.

If the request is a single-step technique already covered by a local
Cursor skill (`/explore`, `/pre-code`, `/simplify`, `/gate`,
`/goal`, `/wave`, `/reflow`, …), use that skill directly instead.

## How to invoke

The sibling worker that owns `@bpmforge/attest-conductor` is still
settling on the exact invocation surface. Pick the first option that
succeeds for the current environment:

### Option 1 — MCP tool (preferred, after the sibling lands it)

Call the `attest` MCP server (configured in `.cursor/mcp.json`) and
pass the natural-language goal plus any flags the user provided:

```
attest.conductor.run({
  goal: "<verbatim user ask>",
  mode: "<sdlc|security|review|autopilot|release|...>",
  budget: <optional iteration cap>,
  autonomy: "<interactive|auto>"
})
```

The server returns a conductor run ID. Stream status back to the user as
the MCP server emits it; do NOT attempt to run the persona's workflow
inline while waiting.

### Option 2 — deployed BDK endpoint (if available)

If the sibling has published a hosted URL (set in the user's secrets as
`ATTEST_CONDUCTOR_URL`), POST the same JSON body to:

```
POST ${ATTEST_CONDUCTOR_URL}/conductor/run
Content-Type: application/json
```

### Option 3 — Cursor Automation / cloud subagent (fallback)

Trigger a Cursor Automation that spawns the conductor as a cloud
subagent on its own VM. See `https://cursor.com/docs/agent/cloud-agents`
for the current automation UI.

## TODO — resolve before Phase 1 ships

The exact deployed URL and MCP tool name land in a sibling PR
(`feat/attest-conductor` → `@bpmforge/attest-conductor`). When that
PR merges:

1. Fill in the real MCP tool name (currently `attest.conductor.run` is
   a placeholder — the sibling may name it `attest.autopilot.run`,
   `attest.sdlc.start`, etc.).
2. Confirm the server-name is still `attest` (matches `.cursor/mcp.json`).
3. Update this skill's examples with real request/response shapes.

Until then, if none of the three options is available, tell the user:

> **BLOCKED:** attest-conductor isn't wired up yet — this request would
> run as a BDK agent in `@bpmforge/attest-conductor`, which the sibling
> worker is still scaffolding. If you want a Cursor-local best-effort
> for a single-step piece, say so and I'll use the matching technique
> skill (`/explore`, `/pre-code`, `/simplify`, `/gate`, …).

## Why not host the personas locally?

See `.cursor/README.md`. Short version: Cursor is single-agent-with-
subagents; attest's value is 65+ specialists with HANDOFF plumbing, gate
scoring, delegation log, multi-model review, and a conductor loop that
owns tickets / worktrees / merges. That shape is what BDK is for; the
local-editor surface is the hook/rule layer plus the few genuine
technique skills (`.cursor/skills/*`).
