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
personas (security-auditor, code-reviewer, landscape-mapper, …) run as
BDK agents in **@bpmforge/attest-experts**, orchestrated by
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

Pick the first option that succeeds for the current environment.

### Option 1 — `attest-conductor` MCP server (preferred)

`.cursor/mcp.json` wires an `attest-conductor` server (`bdk serve` of
`packages/attest-conductor` locally, or an HTTP MCP transport pointing at
the deployed BDK agent in a hosted install). Call its single server tool
`run_autopilot_task` with the natural-language goal plus any flags:

```
attest-conductor.run_autopilot_task({
  goal: "<verbatim user ask>",
  iterationCap: <optional: default 6>,
  wallTimeCapMs: <optional: default 15*60_000>,
  consecutiveNoProgressCap: <optional: default 3>,
  maxTurns: <optional: default 10>
})
```

Returns the final task record `{ taskId, stop, task, turns }` once the
Ralph loop stops (iteration cap, wall-time cap, consecutive-no-progress
cap, agent-decided `mark_done`, or agent-decided `escalate`). Stream a
short status back to the user while waiting; do NOT attempt to run the
persona's workflow inline.

Alternative chat shape: send `/autopilot <goal>` as the message to the
same MCP server's default `ask` tool — the conductor's LLM recognizes
the slash prefix and calls `run_autopilot_task` internally with the
same contract.

### Option 2 — HTTPS endpoint (fallback)

If `.cursor/mcp.json` is unreachable (sandbox, offline, hosted install
without the MCP transport), POST directly to the conductor's HTTP channel.
Use `$ATTEST_CONDUCTOR_URL` from the user's env (or the hosted URL baked
into the install):

```
POST ${ATTEST_CONDUCTOR_URL}/v1/channels/autopilot/run
Content-Type: application/json

{
  "goal": "<verbatim user ask>",
  "iterationCap": <optional>,
  "wallTimeCapMs": <optional>,
  "maxTurns": <optional>
}
```

Same response shape as Option 1.

### Option 3 — GitHub comment (fallback)

The conductor also listens on the `github` channel for comments that
begin with `/autopilot …` on issues, PRs, and review comments. Only use
this path when neither MCP nor HTTPS is reachable AND the user explicitly
wants the run tracked on an issue / PR:

- Pick an existing attest-tracked issue (or ask the user to create one).
- Post a comment via the Cursor Agent's GitHub tooling with the body
  `/autopilot <verbatim user ask>` — the conductor's GitHub channel
  (secrets: `GITHUB_WEBHOOK_SECRET`, `GITHUB_APP_ID`,
  `GITHUB_APP_PRIVATE_KEY`) picks it up.
- The conductor replies on the same thread with run status + taskId.

## Why not host the personas locally?

See `.cursor/README.md`. Short version: Cursor is single-agent-with-
subagents; attest's value is 33+ specialists with HANDOFF plumbing, gate
scoring, delegation log, multi-model review, and a conductor loop that
owns tickets / worktrees / merges. That shape is what BDK is for; the
local-editor surface is the hook/rule layer plus the few genuine
technique skills (`.cursor/skills/*`).
