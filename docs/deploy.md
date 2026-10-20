# attest — deploy runbook

**Audience:** Bradford (or anyone running attest on their own machine).
**Prerequisites:** repo cloned from `bmatthews-dexcom/attest`, Node ≥ 20, `npm`.

attest-for-Cursor is **local-only**. No npm packages are published, no
public registry is used, no public pool is shared. The source lives on
`bmatthews-dexcom/attest` on your personal GitHub and nowhere else. The
BDK agents can also run as Cursor-hosted deployments — those run on
Cursor's own infrastructure, not npm.

Two independent paths:

| Path | What it is | Credentials |
|---|---|---|
| **(1) Local run with `bdk dev`** | Everything runs on this machine. The conductor, every expert, and the attest-mcp server boot locally. Cursor talks to them over stdio / loopback MCP. | **None.** |
| **(2) Hosted deploy with `./scripts/deploy.sh`** | The conductor and the three concrete expert BDK agents get uploaded to Cursor-managed hosting under your Cursor account. The attest-mcp stdio server still runs locally on each machine that uses them. | `CURSOR_API_KEY` from Cursor Dashboard → Settings → API Keys. |

Pick (1) for day-to-day editor use. Pick (2) when you want the
`/autopilot` loop to run server-side (so GitHub comments and HTTP calls
can wake it up without a Cursor session attached).

## Path 1 — local run

One-time install:

```bash
./scripts/local-install.sh
```

Idempotent. Does `npm install` at the repo root (npm workspaces links
`packages/*` as workspace siblings), builds `attest-mcp` to produce
`dist/cli.js`, and typechecks the two BDK packages.

Then any of:

```bash
# conductor dev server (hot-reloads on source edits):
npm --prefix packages/attest-conductor run dev

# every expert, served as one multi-agent BDK host:
npm --prefix packages/attest-experts run serve

# attest-mcp stdio server, for manual MCP-client testing:
npm --prefix packages/attest-mcp start
```

Cursor itself picks up the committed `.cursor/mcp.json` and launches
`node packages/attest-mcp/dist/cli.js` on-demand — no extra wiring.

To exercise the whole stack with a real Cursor model turn (needs a
credential — see §Credentials below):

```bash
npm run live-eval
```

That runs the cross-package integration eval against a locally-booted
attest-mcp child process and writes the full BDK transcript to
`artifacts/live-eval/<timestamp>.jsonl`.

## Path 2 — hosted deploy

```bash
# 0. one-time install (same as Path 1 — the deploy still typechecks locally):
./scripts/local-install.sh

# 1. make the credential available (see §Credentials):
export CURSOR_API_KEY=sk-...
# or write it to .env (see .env.example) and the deploy script will source it

# 2. dry-run first — no network calls to Cursor's control plane:
./scripts/deploy.sh --dry-run

# 3. inspect what would run:
ls artifacts/deploy/
cat artifacts/deploy/*.json

# 4. publish:
./scripts/deploy.sh --publish
```

`./scripts/deploy.sh --publish` runs serially: every concrete expert
(`attest-expert-security-auditor`, `attest-expert-code-reviewer`,
`attest-expert-landscape-mapper`) first, then `attest-conductor` last.
The conductor goes last on purpose — its `dispatch_expert` tool needs
the expert peer slugs to exist in Cursor's control plane before its
first dispatch.

Each deploy writes its response (slug, status, hosted URL) to
`artifacts/deploy/<timestamp>.json`.

Verify:

```bash
npx -y @cursor/bdk@0.2.27 deployments --json | jq '.[] | {slug, status}'
# every slug should show status: "running"
```

Once hosted, you can wire Cursor itself to the hosted conductor by
swapping the `attest-conductor` stanza in your `.cursor/mcp.json` from
the local `bdk serve` form to:

```json
"attest-conductor": {
  "url": "https://<slug>.<team>.<host>/v1/mcp",
  "type": "http"
}
```

The URL is in the deploy artifact.

## Credentials

### `CURSOR_API_KEY`

Create at: **[cursor.com/dashboard](https://cursor.com/dashboard) → Settings → API Keys**.
Prefer a Project-scoped key over a personal key for deploys.

Two places to put it:

| Where | When |
|---|---|
| `.env` at the repo root | Default. `.env` is gitignored (`.env.example` is the template). `./scripts/deploy.sh` auto-sources `.env` if `CURSOR_API_KEY` is not already in the shell. |
| Shell env (`export CURSOR_API_KEY=...`) | CI, one-off deploys, or when you don't want to persist the key to disk. Shell env always wins over `.env`. |

**No npm registry token, ever.** This project is not pushed to the
npm registry. The scripts never ask for one.

### `CURSOR_SERVICE_ACCOUNT_KEY` (alternative)

Only relevant if you're deploying from CI or a shared machine. See the
BDK deploy skill (`skills-cursor/bdk-deploy/SKILL.md`) for the
service-account flow. For personal use, `CURSOR_API_KEY` is simpler.

## Rollback

### Cursor hosted deployments

`bdk` ships a `rollback` subcommand that restores a prior successful
release:

```bash
# roll conductor back to the previous release:
npx -y @cursor/bdk@0.2.27 rollback attest-conductor --json

# roll a specific expert back:
npx -y @cursor/bdk@0.2.27 rollback attest-expert-security-auditor --json

# roll to a specific release id:
npx -y @cursor/bdk@0.2.27 rollback attest-conductor --release <rel_...>

# or stop the deployment entirely (returns 404 to callers; keeps metadata):
npx -y @cursor/bdk@0.2.27 stop attest-conductor
```

Rollbacks are atomic per slug.

### Local run

There is nothing to roll back — just `git checkout` the earlier commit
and re-run `./scripts/local-install.sh`.

### Full teardown

```bash
# stop every hosted slug (keeps deployment metadata for later roll-forward):
for slug in attest-conductor attest-expert-security-auditor \
            attest-expert-code-reviewer attest-expert-landscape-mapper; do
  npx -y @cursor/bdk@0.2.27 stop "$slug" || true
done

# delete entirely (slugs become reusable):
for slug in attest-conductor attest-expert-security-auditor \
            attest-expert-code-reviewer attest-expert-landscape-mapper; do
  npx -y @cursor/bdk@0.2.27 delete "$slug" || true
done
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `deploy FAIL: no Cursor credential found.` | `CURSOR_API_KEY` not in shell or `.env`. | Create at Cursor Dashboard → Settings → API Keys; put in `.env`. |
| `deploy FAIL: ref … is not on any remote branch` | Local commit not pushed. | `git push -u origin <branch>` to `bmatthews-dexcom/attest`, re-run. |
| `bdk validate failed on packages/attest-experts/agents` | One of the 84 expert agent directories is misconfigured. | Read `/tmp/attest-deploy-experts-validate.log`. |
| `deployment status is "failed"` | BDK accepted the deploy but the agent crashed on first boot. | `npx -y @cursor/bdk@0.2.27 logs <slug> --prod` for the boot error. |
| `live-eval: set CURSOR_API_KEY to run.` | Credential not in-scope for the shell. | `source .env` or `export CURSOR_API_KEY=...`. |
| `attest-mcp build did not produce dist/cli.js` | TypeScript compile error in the mcp package. | Fix the error, re-run `./scripts/local-install.sh`. |

## What this runbook deliberately does NOT do

- **No npm-registry upload.** This project does not ship to any public
  registry. The three `packages/*` are all `"private": true`. If you
  ever see a script attempting to push to the npm registry, that is a
  bug — report it.
- **No GitHub release workflow that publishes to a package registry.**
  The `.github/workflows/ci.yml` runs tests, parity checks, and
  validators; it does not publish artifacts off-machine.
- **No separate `attest-experts` repo.** The experts live as a workspace
  sibling in this repo under `packages/attest-experts/`. The hosted
  deploy picks it up via `--dir packages/attest-experts/agents`.
- **No shared "public pool" of attest-cursor packages.** Everyone who
  wants to use this clones `bmatthews-dexcom/attest` and runs
  `./scripts/local-install.sh` themselves.
