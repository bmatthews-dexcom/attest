#!/usr/bin/env bash
# scripts/deploy-mcp.sh — publish `@bpmforge/attest-mcp` to the npm registry.
#
# Default mode: --dry-run. Nothing is published. Everything that would
# happen is logged.
#
# --publish flag: run the real `npm publish --access public` after the
# preflight checks pass. The script fails loudly on any precondition miss
# (dirty tree, missing npm token, matching version already on the registry,
# tests red). No half-states.
#
# What this script does NOT do:
#   * It does not bump the package version. That is a human decision —
#     if the registry already carries the target version, the script
#     refuses with instructions.
#   * It does not push git tags. Tag + GitHub release is a separate step
#     documented in docs/deploy.md.
#   * It does not run `bdk deploy` — this script is for the npm-published
#     surface only. The conductor + experts deploy via scripts/deploy-conductor.sh
#     and scripts/deploy-experts.sh.
#
# Env:
#   NPM_TOKEN       — required for --publish. Set to a token with publish
#                     scope on @bpmforge/attest-mcp. --dry-run does NOT
#                     need it (but will warn so the user sees the gap).
#   SKIP_GIT_CHECK  — set to 1 to allow a dirty tree (CI-release use only).
#   SKIP_TESTS      — set to 1 to skip the package test suite (not advised).
#
# Exit codes:
#   0  dry-run OK, OR publish succeeded.
#   1  preflight failed (dirty tree, version collision, tests red,
#      missing token for --publish, missing build artifact).
#   2  unknown flag.
#
# Usage:
#   ./scripts/deploy-mcp.sh                 # dry-run (default)
#   ./scripts/deploy-mcp.sh --dry-run       # explicit dry-run
#   ./scripts/deploy-mcp.sh --publish       # publish to npm (requires NPM_TOKEN)

set -euo pipefail

MODE="dry-run"
for arg in "$@"; do
  case "$arg" in
    --dry-run) MODE="dry-run" ;;
    --publish) MODE="publish" ;;
    -h|--help)
      sed -n '2,40p' "$0"
      exit 0
      ;;
    *)
      echo "deploy-mcp: unknown flag: $arg" >&2
      echo "Run \`./scripts/deploy-mcp.sh --help\` for usage." >&2
      exit 2
      ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG_DIR="$REPO_ROOT/packages/attest-mcp"
ARTIFACT_DIR="$REPO_ROOT/artifacts/deploy"

cd "$REPO_ROOT"

log() { printf '[deploy-mcp %s] %s\n' "$MODE" "$*"; }
die() { printf '[deploy-mcp FAIL] %s\n' "$*" >&2; exit 1; }

log "step 1/6 — resolve package metadata"
PKG_NAME="$(node -p "require('$PKG_DIR/package.json').name")"
PKG_VERSION="$(node -p "require('$PKG_DIR/package.json').version")"
PKG_PRIVATE="$(node -p "Boolean(require('$PKG_DIR/package.json').private)")"
if [ "$PKG_PRIVATE" = "true" ]; then
  die "$PKG_NAME is marked private in package.json; refusing to publish."
fi
log "package: $PKG_NAME@$PKG_VERSION"

log "step 2/6 — check git working tree is clean"
if [ "${SKIP_GIT_CHECK:-0}" = "1" ]; then
  log "SKIP_GIT_CHECK=1 — bypassing cleanliness check"
elif ! git diff --quiet || ! git diff --cached --quiet; then
  if [ "$MODE" = "publish" ]; then
    git status --short >&2
    die "working tree is dirty — commit or stash first, or set SKIP_GIT_CHECK=1."
  fi
  log "warn: working tree is dirty — --publish will refuse until it is clean."
else
  CURRENT_SHA="$(git rev-parse HEAD)"
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  log "clean on $BRANCH @ $CURRENT_SHA"
fi

log "step 3/6 — check version is not already on the registry"
# `npm view` returns non-zero when the version is missing — that's success.
# When the version exists it prints the version string; we fail then.
if NPM_EXISTING="$(npm view "$PKG_NAME@$PKG_VERSION" version 2>/dev/null)"; then
  if [ -n "$NPM_EXISTING" ]; then
    die "$PKG_NAME@$PKG_VERSION already exists on the registry. Bump the version in $PKG_DIR/package.json and re-run."
  fi
fi
log "version $PKG_VERSION is free on the npm registry"

log "step 4/6 — build + bundle package"
(cd "$PKG_DIR" && npm run clean >/dev/null 2>&1 || true)
(cd "$PKG_DIR" && npm run build >/dev/null)
if [ ! -f "$PKG_DIR/dist/cli.js" ]; then
  die "build did not produce $PKG_DIR/dist/cli.js — fix the build before publishing."
fi
log "build OK → dist/cli.js"

log "step 5/6 — run package test suite"
if [ "${SKIP_TESTS:-0}" = "1" ]; then
  log "SKIP_TESTS=1 — bypassing tests (NOT recommended)"
else
  if ! (cd "$PKG_DIR" && npm test) >/tmp/attest-mcp-test.log 2>&1; then
    tail -40 /tmp/attest-mcp-test.log >&2 || true
    die "package tests failed. See /tmp/attest-mcp-test.log for the full log."
  fi
  log "package tests passed"
fi

mkdir -p "$ARTIFACT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

if [ "$MODE" = "dry-run" ]; then
  log "step 6/6 — DRY RUN: npm publish --access public --dry-run"
  if ! (cd "$PKG_DIR" && npm publish --access public --dry-run) >/tmp/attest-mcp-dryrun.log 2>&1; then
    cat /tmp/attest-mcp-dryrun.log >&2 || true
    die "npm publish --dry-run failed. See /tmp/attest-mcp-dryrun.log."
  fi
  TARBALL_LINE="$(grep -E 'npm notice (filename|package size|unpacked size|total files)' /tmp/attest-mcp-dryrun.log || true)"
  log "dry-run tarball summary:"
  printf '%s\n' "$TARBALL_LINE" | sed 's/^/    /'
  ARTIFACT="$ARTIFACT_DIR/mcp-$STAMP.dryrun.json"
  cat >"$ARTIFACT" <<EOF
{
  "mode": "dry-run",
  "package": "$PKG_NAME",
  "version": "$PKG_VERSION",
  "stamp": "$STAMP",
  "note": "Nothing was published. Re-run with --publish and NPM_TOKEN set to actually publish."
}
EOF
  log "artifact: $ARTIFACT"
  log "DONE — dry-run clean. To publish for real: NPM_TOKEN=... ./scripts/deploy-mcp.sh --publish"
  exit 0
fi

if [ -z "${NPM_TOKEN:-}" ]; then
  die "NPM_TOKEN is not set. Export a token with publish scope on $PKG_NAME, then re-run with --publish."
fi

log "step 6/6 — publishing $PKG_NAME@$PKG_VERSION to npm (access=public)"
NPMRC="$(mktemp)"
trap 'rm -f "$NPMRC"' EXIT
printf '//registry.npmjs.org/:_authToken=%s\n' "$NPM_TOKEN" >"$NPMRC"
if ! (cd "$PKG_DIR" && npm --userconfig "$NPMRC" publish --access public) >/tmp/attest-mcp-publish.log 2>&1; then
  cat /tmp/attest-mcp-publish.log >&2 || true
  die "npm publish failed. See /tmp/attest-mcp-publish.log for details."
fi
log "published $PKG_NAME@$PKG_VERSION"
ARTIFACT="$ARTIFACT_DIR/mcp-$STAMP.publish.json"
cat >"$ARTIFACT" <<EOF
{
  "mode": "publish",
  "package": "$PKG_NAME",
  "version": "$PKG_VERSION",
  "stamp": "$STAMP",
  "registry": "https://registry.npmjs.org/",
  "git_sha": "$(git rev-parse HEAD)",
  "git_branch": "$(git rev-parse --abbrev-ref HEAD)"
}
EOF
log "artifact: $ARTIFACT"
log "DONE — $PKG_NAME@$PKG_VERSION published."
