# attest-director-mcp

MCP server exposing the attest Director's tool surface — the surface the Director BDK agent and the CEO call for role-brief intake, research/draft/eval, Cedar-style policy evaluation, HITL approvals, and local-only promotion.

**Local only. Never published to npm.** Resolve this package via the workspace sibling (`attest-director`'s `file:../attest-director-mcp` dependency) or the direct binary (`./node_modules/.bin/attest-director-mcp`). Never `npx --yes attest-director-mcp` — Bradford's distribution constraint forbids any npm registry fetch for the Director surface. The design doc §8.1 restates this verbatim.

## Tool surface

Grouped by lifecycle phase (per `docs/attest-director-architecture.md` §4):

- **Phase 1 — detect gap:** `director.create_expert`, `proximity_check`
- **Phase 2 — research:** `research_role`
- **Phase 3 — draft:** `pick_form_factor`, `generate_persona`, `generate_schema`, `generate_capabilities`, `generate_fixtures`
- **Phase 4 — eval:** `run_eval`
- **Phase 5 — deploy:** `register_expert`, `director.on_expert_deployed`
- **Phase 6 — refine:** `director.sweep`, `director.refine`
- **Shared surface:** `director.list_briefs`, `director.show`, `director.audit`, `director.rate`, `director.promote`, `director.demote`, `director.retire`, `director.autonomy-set`, `promote_to_shared`
- **Policy surface (matches `attest-mcp`):** `evaluate_shell_policy`, `evaluate_write_policy`, `evaluate_mcp_policy`, `list_fences`, `request_approval`

Resources:

- `attest-director://briefs/<id>/completion.json`
- `attest-director://experts/<id>/summary.json`

## Persistence

Default: file-backed kv under `~/.attest-director/kv/`. Override with `ATTEST_DIRECTOR_KV_ROOT`. Tests run with `ATTEST_DIRECTOR_KV_IN_MEMORY=1`.

The hosted Director replaces this at wire time with Cursor-hosted `ctx.host.kv`; the local fallback uses the tenant store (same posture as the CEO).

## Running

```sh
# Development
npm --workspace attest-director-mcp run build
node packages/attest-director-mcp/dist/cli.js --inventory

# From the attest-director agent (automatic once installed as workspace sibling)
```
