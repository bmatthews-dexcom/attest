#!/usr/bin/env bash
# scripts/deploy-conductor.sh — deploy the attest-conductor BDK agent to
# whichever Cursor account the invoker is authenticated as.
#
# Default mode: --dry-run. Nothing hits Cursor's control plane. Preflight
# runs `bdk validate` + `bdk info` + `bdk whoami` and prints the exact
# `bdk deploy ...` command that would run.
#
# --publish mode: runs `bdk deploy --dir packages/attest-conductor` and
# records the response (deployment slug, team, pinned git ref) under
# `artifacts/deploy/conductor-<timestamp>.json`.
#
# bdk has no `--dry-run` flag on `deploy`, so "dry-run" here means the
# preflight checks: credential present, validate green, no uncommitted
# or unpushed source (the live deploy would ship a stale snapshot
# otherwise).
#
# Env:
#   CURSOR_API_KEY        — required (either this or CURSOR_SERVICE_ACCOUNT_KEY).
#   CURSOR_SERVICE_ACCOUNT_KEY — accepted alternative for service-account
#                                flows (see .cursor/skills-cursor/bdk-deploy).
#   CONDUCTOR_SLUG        — override the deployment slug (default: the
#                           package directory name resolved by bdk).
#   CONDUCTOR_TEAM        — override the --team value.
#   CONDUCTOR_REF         — override the git ref to deploy (default: HEAD).
#   SKIP_GIT_CHECK        — 1 to allow a dirty/unpushed tree (dry-run bypass).
#   BDK_VERSION           — override the pinned BDK CLI version (default: 0.2.27).
#
# Exit codes:
#   0  dry-run OK, OR deploy ran and the deployment status is `running`.
#   1  preflight failed OR deploy failed OR deployment status is terminal
#      but not `running` (e.g. `failed`, `cancelled`).
#   2  unknown flag.

set -euo pipefail

MODE="dry-run"
for arg in "$@"; do
  case "$arg" in
    --dry-run) MODE="dry-run" ;;
    --publish) MODE="publish" ;;
    -h|--help)
      sed -n '2,38p' "$0"
      exit 0
      ;;
    *)
      echo "deploy-conductor: unknown flag: $arg" >&2
      echo "Run \`./scripts/deploy-conductor.sh --help\` for usage." >&2
      exit 2
      ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG_DIR="$REPO_ROOT/packages/attest-conductor"
ARTIFACT_DIR="$REPO_ROOT/artifacts/deploy"
BDK_VERSION="${BDK_VERSION:-0.2.27}"
LIB_DIR="$REPO_ROOT/scripts/lib"
# shellcheck source=lib/deploy-common.sh
source "$LIB_DIR/deploy-common.sh"

cd "$REPO_ROOT"

log() { printf '[deploy-conductor %s] %s\n' "$MODE" "$*"; }
die() { printf '[deploy-conductor FAIL] %s\n' "$*" >&2; exit 1; }

log "step 1/5 — resolve package metadata"
if [ ! -f "$PKG_DIR/package.json" ]; then
  die "conductor package not found at $PKG_DIR"
fi
log "package dir: $PKG_DIR"

log "step 2/5 — check credential"
if [ "$MODE" = "publish" ]; then
  check_cursor_credential "deploy-conductor"
else
  warn_missing_credential "deploy-conductor"
fi

log "step 3/5 — git tree + ref"
REF="${CONDUCTOR_REF:-$(git rev-parse HEAD)}"
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "(detached)")"
if [ "${SKIP_GIT_CHECK:-0}" = "1" ]; then
  log "SKIP_GIT_CHECK=1 — bypassing cleanliness check"
elif ! git diff --quiet || ! git diff --cached --quiet; then
  if [ "$MODE" = "publish" ]; then
    git status --short >&2
    die "working tree is dirty — commit and push before deploy, or set SKIP_GIT_CHECK=1."
  fi
  log "warn: working tree is dirty — --publish will refuse until it is clean."
fi
if [ "$MODE" = "publish" ] && [ -z "$(git branch -r --contains "$REF" 2>/dev/null || true)" ]; then
  die "ref $REF is not on any remote branch — push $BRANCH before deploy."
fi
log "ref: $REF (branch: $BRANCH)"

log "step 4/5 — bdk validate"
if ! run_bdk validate --dir "$PKG_DIR" >/tmp/attest-conductor-validate.log 2>&1; then
  tail -40 /tmp/attest-conductor-validate.log >&2 || true
  die "bdk validate failed. See /tmp/attest-conductor-validate.log."
fi
log "validate OK"

mkdir -p "$ARTIFACT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARTIFACT="$ARTIFACT_DIR/conductor-$STAMP.json"

DEPLOY_CMD=(deploy --dir "$PKG_DIR" --ref "$REF" --json)
if [ -n "${CONDUCTOR_SLUG:-}" ]; then
  DEPLOY_CMD+=(--slug "$CONDUCTOR_SLUG")
fi
if [ -n "${CONDUCTOR_TEAM:-}" ]; then
  DEPLOY_CMD+=(--team "$CONDUCTOR_TEAM")
fi

if [ "$MODE" = "dry-run" ]; then
  log "step 5/5 — DRY RUN: would run"
  printf '    bdk %s\n' "$(printf '%q ' "${DEPLOY_CMD[@]}" | sed 's/ $//')"
  cat >"$ARTIFACT" <<EOF
{
  "mode": "dry-run",
  "stamp": "$STAMP",
  "package": "@bpmforge/attest-conductor",
  "dir": "$PKG_DIR",
  "git_ref": "$REF",
  "slug": "${CONDUCTOR_SLUG:-"(bdk-inferred)"}",
  "team": "${CONDUCTOR_TEAM:-"(service-account default)"}",
  "note": "Nothing was deployed. Re-run with --publish and a valid Cursor credential to deploy."
}
EOF
  log "artifact: $ARTIFACT"
  log "DONE — dry-run clean. To deploy for real: CURSOR_API_KEY=... ./scripts/deploy-conductor.sh --publish"
  exit 0
fi

log "step 5/5 — deploying conductor"
if ! run_bdk "${DEPLOY_CMD[@]}" >/tmp/attest-conductor-deploy.log 2>&1; then
  tail -60 /tmp/attest-conductor-deploy.log >&2 || true
  die "bdk deploy failed. See /tmp/attest-conductor-deploy.log."
fi

DEPLOY_JSON="$(cat /tmp/attest-conductor-deploy.log)"
SLUG="$(node -e 'let r=""; process.stdin.on("data",d=>r+=d); process.stdin.on("end",()=>{try{const o=JSON.parse(r);process.stdout.write(o.slug||o.deployment?.slug||"")}catch{process.stdout.write("")}})' <<<"$DEPLOY_JSON")"
STATUS="$(node -e 'let r=""; process.stdin.on("data",d=>r+=d); process.stdin.on("end",()=>{try{const o=JSON.parse(r);process.stdout.write(o.status||o.deployment?.status||"")}catch{process.stdout.write("")}})' <<<"$DEPLOY_JSON")"

cat >"$ARTIFACT" <<EOF
{
  "mode": "publish",
  "stamp": "$STAMP",
  "package": "@bpmforge/attest-conductor",
  "dir": "$PKG_DIR",
  "git_ref": "$REF",
  "slug": "$SLUG",
  "status": "$STATUS",
  "team": "${CONDUCTOR_TEAM:-"(service-account default)"}"
}
EOF
log "artifact: $ARTIFACT"
if [ "$STATUS" != "running" ]; then
  die "deployment status is \"$STATUS\" (expected \"running\"). See /tmp/attest-conductor-deploy.log for the full response."
fi
log "DONE — conductor deployed as slug=$SLUG status=$STATUS"
