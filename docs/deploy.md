# attest-for-Cursor — deploy runbook

**Audience:** the human running the release.
**Prerequisites:** repo checked out at the release ref, Node ≥ 20,
`npm`, and a shell with network access to npm + Cursor's control plane.

This runbook assumes you have already merged (or are about to merge) the
five integration PRs — see
[`docs/release-notes/attest-cursor-v0.1.0.md`](release-notes/attest-cursor-v0.1.0.md)
for the stack.

Every script in this runbook defaults to `--dry-run`. Nothing hits a
registry or Cursor until you add `--publish`.

## 1. Export credentials

Export whichever credentials apply to the pieces you plan to publish:

```bash
# For deploy-mcp.sh (npm publish):
export NPM_TOKEN=npm_...          # scope: publish on @bpmforge/attest-mcp

# For deploy-experts.sh + deploy-conductor.sh (bdk deploy):
export CURSOR_API_KEY=sk-...       # personal account
# or
export CURSOR_SERVICE_ACCOUNT_KEY=sa_... # service account (preferred for CI)
```

The scripts refuse `--publish` without the required credential in-scope.
`--dry-run` emits a warning when a credential is missing but still runs
through its preflight checks.

Optional overrides, documented inline in each script header:

```bash
export CONDUCTOR_SLUG=attest-conductor       # default: inferred from --dir
export CONDUCTOR_TEAM=team_xxx               # default: service-account team
export EXPERTS_SUBSET=security-auditor       # dry-run / test one at a time
```

## 2. Dry-run everything

```bash
./scripts/deploy-all.sh --dry-run
```

What runs under the hood, in order:

1. `scripts/deploy-mcp.sh --dry-run` — resolves `@bpmforge/attest-mcp`
   metadata, checks the version is free on the npm registry, builds +
   bundles the package, runs the package test suite, and executes
   `npm publish --dry-run` to print the exact tarball shape.
2. `scripts/deploy-experts.sh --dry-run` — resolves the list of
   `concrete` experts from `packages/attest-experts/lib/experts.generated.json`,
   runs `bdk validate --dir packages/attest-experts/agents` (which
   validates every expert, concrete + stub), and prints the exact
   `bdk deploy …` command that would run per expert.
3. `scripts/deploy-conductor.sh --dry-run` — runs `bdk validate` over
   the conductor and prints the `bdk deploy …` command.

Each step writes a timestamped JSON artifact under `artifacts/deploy/`:

- `mcp-<timestamp>.dryrun.json`
- `experts-<timestamp>.json`
- `conductor-<timestamp>.json`

### Inspect

```bash
ls artifacts/deploy/
cat artifacts/deploy/mcp-*.dryrun.json
```

If the dry-run surfaces anything unexpected (a version collision, a
dirty tree, a `bdk validate` failure), fix it before continuing. The
scripts fail loudly with the specific remedy; nothing moves forward
until the step before it is clean.

## 3. Publish

Only once the dry-run is clean:

```bash
./scripts/deploy-all.sh --publish
```

What this does, in order:

1. `scripts/deploy-mcp.sh --publish`
   - Requires `NPM_TOKEN`, clean git tree, matching version not already
     on the registry, package tests green.
   - Runs `npm publish --access public` for `@bpmforge/attest-mcp`.
   - Writes `artifacts/deploy/mcp-<timestamp>.publish.json` with the
     published version, the git SHA, and the branch.
2. `scripts/deploy-experts.sh --publish`
   - Requires `CURSOR_API_KEY` or `CURSOR_SERVICE_ACCOUNT_KEY`, clean
     git tree, ref pushed to the remote.
   - Runs `bdk deploy --dir packages/attest-experts/agents --slug
     attest-expert-<id> --ref <HEAD-sha>` for each concrete expert,
     serially. Fails fast if any single deploy ends in anything other
     than `status: "running"`.
   - Writes `artifacts/deploy/experts-<timestamp>.json` with the slug +
     status of each.
3. `scripts/deploy-conductor.sh --publish`
   - Same preflight + env requirements as the experts.
   - Runs `bdk deploy --dir packages/attest-conductor --ref <HEAD-sha>`.
   - Writes `artifacts/deploy/conductor-<timestamp>.json`.

The conductor is published last on purpose — it depends on the expert
peer slugs being resolvable in Cursor's control plane, so publishing
experts first ensures the conductor's `dispatch_expert` can find them
on first invocation.

### Verify

```bash
# npm side:
npm view @bpmforge/attest-mcp version
npm view @bpmforge/attest-mcp dist.tarball

# bdk side (requires CURSOR_API_KEY / CURSOR_SERVICE_ACCOUNT_KEY):
npx -y @cursor/bdk@0.2.27 deployments --json | jq '.[] | {slug, status}'
npx -y @cursor/bdk@0.2.27 deployment attest-conductor --json | jq '{slug, status, ref}'
npx -y @cursor/bdk@0.2.27 deployment attest-expert-security-auditor --json | jq '{slug, status}'
```

Every slug should show `status: "running"`.

### Live-eval the stack

```bash
# requires CURSOR_API_KEY in-scope
npm run live-eval
```

This boots a local `@bpmforge/attest-mcp` child process, runs the
`integration/attest-e2e` BDK eval against the conductor's chat tool, and
captures the full transcript to `artifacts/live-eval/<timestamp>.jsonl`.
A pass means the whole stack (route → dispatch → validate → gate → done)
drives a trivial-repo fixture end-to-end against a real Cursor model.

## 4. Rollback

### npm (attest-mcp)

```bash
# unpublish a buggy version (only within the 72-hour window npm allows):
npm unpublish @bpmforge/attest-mcp@<bad-version>

# OR deprecate a bad version in-place (preferred — doesn't break consumers
# who already installed it, and tells future installers to avoid it):
npm deprecate @bpmforge/attest-mcp@<bad-version> \
  "Use @bpmforge/attest-mcp@<good-version> — <reason>"
```

Clients consuming `npx -y @bpmforge/attest-mcp` without a version pin
will pick up the latest; deprecating is usually the right move once a
bad version has been seen by any downstream.

### Cursor BDK deployments (conductor + experts)

`bdk` ships a `rollback` subcommand that restores a prior successful
release of a deployment slug:

```bash
# roll conductor back to the previous release:
npx -y @cursor/bdk@0.2.27 rollback attest-conductor --json

# roll a specific expert back:
npx -y @cursor/bdk@0.2.27 rollback attest-expert-security-auditor --json

# roll to a specific release id:
npx -y @cursor/bdk@0.2.27 rollback attest-conductor --release <rel_...>

# worst case — stop the deployment entirely (returns 404 for all callers):
npx -y @cursor/bdk@0.2.27 stop attest-conductor
```

Rollbacks are atomic per slug: the control plane either swings traffic
to the prior release cleanly or refuses. There is no half-state.

### Full teardown

If the entire release needs to come down (e.g. a credential leak or a
serious regression):

```bash
# stop everything (keeps the deployment metadata so you can roll forward):
for slug in attest-conductor attest-expert-security-auditor \
            attest-expert-code-reviewer attest-expert-landscape-mapper; do
  npx -y @cursor/bdk@0.2.27 stop "$slug" || true
done

# delete entirely (slugs become reusable):
for slug in attest-conductor attest-expert-security-auditor \
            attest-expert-code-reviewer attest-expert-landscape-mapper; do
  npx -y @cursor/bdk@0.2.27 delete "$slug" || true
done

# deprecate the npm package (do NOT unpublish once it has been seen):
npm deprecate @bpmforge/attest-mcp@<released-version> \
  "Pulled 0.1.0 due to <reason>. Next release will reset."
```

## 5. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `deploy-mcp: version X already exists` | Someone else or a previous run already published. | Bump `packages/attest-mcp/package.json#version`, commit, re-run. |
| `deploy-conductor: ref … is not on any remote branch` | HEAD was committed locally but not pushed. | `git push -u origin <branch>` and re-run. |
| `deploy-experts: validate failed` | `bdk validate` surfaced a schema error in one of the 84 expert directories. | Read `/tmp/attest-experts-validate.log`. The common cause is a Phase-2 stub whose `bot/agent.ts` broke the registry convention. |
| `deployment status is "failed"` | BDK accepted the deploy but the agent crashed on first boot. | `bdk logs <slug> --prod` for the boot error. Fix in-tree, re-deploy. |
| `live-eval: set CURSOR_API_KEY to run.` | Credential not in-scope for the shell. | `export CURSOR_API_KEY=...` and re-run. |

## 6. What this runbook deliberately does NOT do

- **It does not bump versions.** Version bumps are a human decision; the
  scripts refuse when a version already exists on the registry.
- **It does not push git tags.** Tag the release after the publish is
  green (`git tag v0.1.0-cursor && git push --tags`).
- **It does not open the GitHub release.** Open it with the body from
  [`docs/release-notes/attest-cursor-v0.1.0.md`](release-notes/attest-cursor-v0.1.0.md)
  once the published versions are confirmed.
- **It does not deploy to third-party registries.** No Cursor Marketplace,
  no VSIX, no Homebrew. Those live in follow-up releases.
