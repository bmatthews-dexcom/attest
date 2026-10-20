---
name: invoke-attest-conductor
description: 'Route a long-running / unattended attest task (autopilot, multi-phase SDLC build, scheduled runs) to the HOSTED conductor BDK agent (workspace sibling attest-conductor). For small SDLC questions ("what phase?", "run the gate", "advance one step") prefer the sdlc-lead skill — do not wake the hosted conductor unless you actually need autopilot. The hosted conductor and sdlc-lead share one policy engine; this skill is specifically the "I need the long-running Ralph loop" door.'
disable-model-invocation: true
---

<!--
  attest-cursor Shape-C skill — hosted-conductor dial-out.
  Two chiefs:
    • sdlc-lead (.cursor/skills/sdlc-lead/SKILL.md + agents/sdlc-lead.md)
      — editor-side chief for interactive /sdlc work.
    • conductor (workspace sibling attest-conductor, served via BDK)
      — hosted BDK chief for /autopilot and GitHub-driven work.
  Pick sdlc-lead for small / interactive asks; this skill for long-running
  unattended work. Local-only — attest-conductor is a workspace sibling
  and is NEVER fetched from npm. See .cursor/README.md for the full
  two-chief design.
-->

# invoke-attest-conductor

The local Cursor Agent is a thin editor-time veneer. Under Shape C it
has **two chiefs** it can wake up:

1. **sdlc-lead** — the editor-side chief
   (`.cursor/skills/sdlc-lead/SKILL.md` and
   `.cursor/agents/sdlc-lead.md`). The user is at the keyboard, the
   turn is short-lived, the ask fits in one Cursor conversation.
2. **The hosted conductor** — the workspace sibling `attest-conductor`
   (served locally via the `attest-conductor` MCP entry; the Cursor-
   hosted deploy path is `npx @cursor/bdk deploy` from
   `packages/attest-conductor`). The user has closed their laptop,
   the ask is multi-phase, or the trigger is GitHub.

**This skill is specifically the hosted-conductor door.** For
interactive SDLC asks, prefer sdlc-lead — do not wake the hosted
conductor unless you actually need autopilot. Both chiefs share the
same `attest-mcp` policy engine and the same `attest-experts`
fleet, so the governance is unified; the difference is who starts the
turn and whether the loop outlives the current chat.

## When to prefer sdlc-lead instead

If the ask would end in the same chat with the user still watching —
"what phase are we in?", "run the gate", "advance one step", "which
expert owns this?", "review the whole thing" — use the sdlc-lead skill
or switch to the sdlc-lead custom-mode agent. sdlc-lead can `invoke_expert`
through attest-mcp for a single expert turn and give you an answer
in-conversation without waking a hosted BDK pod.

## When to invoke the conductor (this skill)

Invoke the conductor whenever the ask is:

- "run /autopilot ..." (any variant),
- "finish the board", "work through all the open tickets",
- "do a full multi-phase build with no further input from me",
- "ship a release and merge it",
- A GitHub-channel trigger (comment, scheduled run) — the conductor
  owns the GitHub front door already.

Natural-language triggers that still belong here (not sdlc-lead):

- "do a full security audit" — multi-expert, long-running.
- "review this change" when "this change" spans dozens of files and
  needs multiple experts.
- Anything that reads like an attest slash command *and* takes long
  enough that the user is closing their laptop.

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

## Why two chiefs instead of one?

See `.cursor/README.md` and `docs/attest-chief-architecture.md`
§Recommendation. Short version: the hosted conductor is right for
unattended multi-phase work (the Ralph loop outlives the chat), the
editor-side sdlc-lead is right for the interactive /sdlc flow (the user
is at the keyboard and wants the answer in-conversation). Both chiefs
share one policy engine and one experts fleet, so the governance is
unified — the only difference is who starts the turn.
