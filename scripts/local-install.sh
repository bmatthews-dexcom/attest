#!/usr/bin/env bash
# scripts/local-install.sh — one-shot install for this machine.
#
# attest is a local-only workspace project: no packages are published to
# npm, no releases live off-machine except the source on
# bmatthews-dexcom/attest. This script walks the two steps a human needs
# on a fresh clone (or after `rm -rf node_modules`):
#
#   1. `npm install` at the repo root — npm workspaces links the three
#      private packages under `packages/*` as workspace siblings.
#   2. Build the one package that ships a compiled artifact
#      (`attest-mcp` emits `dist/cli.js` + its bundled source tree).
#
# Idempotent. Safe to re-run after a code change — the install skips
# unchanged dependencies and `tsc` + `bundle-sources.mjs` are both
# incremental.
#
# No credentials needed. No network calls beyond npm registry fetches
# for workspace deps.
#
# Exit codes:
#   0  install + build succeeded.
#   1  any step failed (install, build, validate).
#   2  unexpected flag.

set -euo pipefail

for arg in "$@"; do
  case "$arg" in
    -h|--help)
      sed -n '2,25p' "$0"
      exit 0
      ;;
    *)
      echo "local-install: unknown flag: $arg" >&2
      echo "Run \`./scripts/local-install.sh --help\` for usage." >&2
      exit 2
      ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

log() { printf '[local-install] %s\n' "$*"; }
die() { printf '[local-install FAIL] %s\n' "$*" >&2; exit 1; }

log "step 1/3 — npm install (workspaces: packages/*)"
if ! npm install --no-audit --no-fund; then
  die "npm install failed. Fix the error above and re-run."
fi

log "step 2/3 — build attest-mcp (dist/cli.js + bundled source tree)"
if ! (cd packages/attest-mcp && npm run build); then
  die "attest-mcp build failed. See the error above."
fi
if [ ! -f packages/attest-mcp/dist/cli.js ]; then
  die "attest-mcp build did not produce dist/cli.js."
fi

log "step 3/3 — verify conductor + experts typecheck"
if ! (cd packages/attest-conductor && npx tsc --noEmit); then
  die "attest-conductor typecheck failed."
fi
if ! (cd packages/attest-experts && npx tsc --noEmit); then
  die "attest-experts typecheck failed."
fi

cat <<EOF
──────────────────────────────────────────────────────────────────────────
ready

Local-only usage (no credentials needed):

  npm --prefix packages/attest-conductor run dev    # BDK dev server, conductor
  npm --prefix packages/attest-experts  run serve   # BDK dev server, every expert
  npm --prefix packages/attest-mcp      start       # stdio attest-mcp

Live eval (needs CURSOR_API_KEY in .env or env):
  npm run live-eval

Hosted deploy to your Cursor account (needs CURSOR_API_KEY):
  ./scripts/deploy.sh --dry-run
  ./scripts/deploy.sh --publish

See docs/deploy.md for the full sequence.
──────────────────────────────────────────────────────────────────────────
EOF
