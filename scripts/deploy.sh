#!/usr/bin/env bash
# scripts/deploy.sh — thin wrapper around `npx @cursor/bdk deploy`.
#
# Deploys the configured BDK agents (the conductor and every concrete
# expert under `packages/attest-experts/agents/`) into whichever Cursor
# account the invoker is authenticated as, in a safe order (experts
# first so the conductor's dispatch_expert can find them on first use).
#
# Nothing in this script talks to npm. No tarballs are published. The
# BDK CLI uploads the pinned Git ref to Cursor-managed hosting; source
# stays on `bmatthews-dexcom/attest`.
#
# Default mode: --dry-run. Runs `bdk validate` on every agent dir and
# prints the exact `bdk deploy …` commands that would run. Nothing hits
# Cursor's control plane.
#
# --publish mode: runs those commands serially. Each deploy writes its
# response (slug, status, hosted URL) under
# `artifacts/deploy/<timestamp>.json`.
#
# Env (read from the shell OR from `.env` at repo root if sourced):
#   CURSOR_API_KEY           — required for --publish. Create at
#                              https://cursor.com/dashboard →
#                              Settings → API Keys.
#   DEPLOY_SUBSET            — comma-separated list of agent slugs to deploy.
#                              Default: conductor + every concrete expert.
#                              Example: DEPLOY_SUBSET=attest-conductor
#   DEPLOY_TEAM              — override the --team value.
#   DEPLOY_REF               — override the git ref (default: HEAD).
#   SKIP_GIT_CHECK=1         — allow a dirty / unpushed tree. Dry-run only.
#   BDK_VERSION              — pin a different @cursor/bdk CLI version
#                              (default: 0.2.27).
#
# Exit codes:
#   0  dry-run OK, OR every selected deploy reached status=running.
#   1  preflight failed OR any single deploy failed (remaining skipped).
#   2  unknown flag.

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
      echo "deploy: unknown flag: $arg" >&2
      echo "Run \`./scripts/deploy.sh --help\` for usage." >&2
      exit 2
      ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONDUCTOR_DIR="$REPO_ROOT/packages/attest-conductor"
EXPERTS_DIR="$REPO_ROOT/packages/attest-experts/agents"
REGISTRY_JSON="$REPO_ROOT/packages/attest-experts/lib/experts.generated.json"
ARTIFACT_DIR="$REPO_ROOT/artifacts/deploy"
BDK_VERSION="${BDK_VERSION:-0.2.27}"

cd "$REPO_ROOT"

log() { printf '[deploy %s] %s\n' "$MODE" "$*"; }
die() { printf '[deploy FAIL] %s\n' "$*" >&2; exit 1; }

# ─── optional .env sourcing (Bradford's preferred secret-location) ──────
if [ -f "$REPO_ROOT/.env" ] && [ -z "${CURSOR_API_KEY:-}" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$REPO_ROOT/.env"
  set +a
  log "sourced .env from repo root"
fi

# ─── pinned CLI invocation (bdk-deploy skill shape) ─────────────────────
run_bdk() {
  env -u NODE_OPTIONS -u CURSOR_API_KEY_FILE \
    npx --yes "@cursor/bdk@${BDK_VERSION}" "$@"
}

check_cred() {
  if [ -n "${CURSOR_API_KEY:-}" ] || [ -n "${CURSOR_SERVICE_ACCOUNT_KEY:-}" ]; then
    return 0
  fi
  cat >&2 <<EOF
[deploy FAIL] no Cursor credential found.

Create one at: https://cursor.com/dashboard  →  Settings  →  API Keys

Then export it in the shell (or add CURSOR_API_KEY=... to .env at the
repo root — the deploy script will auto-source .env):

  export CURSOR_API_KEY=sk-...

See docs/deploy.md for the full sequence.
EOF
  exit 1
}

warn_cred() {
  if [ -n "${CURSOR_API_KEY:-}" ] || [ -n "${CURSOR_SERVICE_ACCOUNT_KEY:-}" ]; then
    return 0
  fi
  cat >&2 <<EOF
[deploy warn] no Cursor credential set — dry-run can still complete, but
--publish will refuse until CURSOR_API_KEY is exported in the shell or
written to .env. Create one at:
  https://cursor.com/dashboard  →  Settings  →  API Keys
EOF
}

# ─── step 1: enumerate what we're deploying ─────────────────────────────
log "step 1/5 — resolve agents to deploy"
if [ ! -f "$REGISTRY_JSON" ]; then
  die "experts registry not found at $REGISTRY_JSON (run \`npm --prefix packages/attest-experts run sync-stubs\`)."
fi

# conductor slug is attest-conductor; expert slugs are attest-expert-<id>.
CONCRETE_EXPERT_IDS="$(node -e "
const r = require('$REGISTRY_JSON');
console.log(r.filter(e => e.status === 'concrete').map(e => e.id).join(' '));
")"
if [ -z "$CONCRETE_EXPERT_IDS" ]; then
  die "no concrete experts in $REGISTRY_JSON"
fi

ALL_SLUGS=""
for id in $CONCRETE_EXPERT_IDS; do
  ALL_SLUGS="$ALL_SLUGS attest-expert-$id"
done
ALL_SLUGS="$ALL_SLUGS attest-conductor"
ALL_SLUGS="$(echo "$ALL_SLUGS" | sed 's/^ *//')"

if [ -n "${DEPLOY_SUBSET:-}" ]; then
  SUBSET_LIST="$(echo "$DEPLOY_SUBSET" | tr ',' ' ')"
  SELECTED=""
  for slug in $SUBSET_LIST; do
    if ! echo "$ALL_SLUGS" | tr ' ' '\n' | grep -qx "$slug"; then
      die "DEPLOY_SUBSET contains \"$slug\" which is not a recognised slug. Known: $ALL_SLUGS"
    fi
    SELECTED="$SELECTED $slug"
  done
  SELECTED="$(echo "$SELECTED" | sed 's/^ *//')"
else
  SELECTED="$ALL_SLUGS"
fi
log "known slugs: $ALL_SLUGS"
log "selected:    $SELECTED"

# ─── step 2: credential check ───────────────────────────────────────────
log "step 2/5 — credential check"
if [ "$MODE" = "publish" ]; then
  check_cred
else
  warn_cred
fi

# ─── step 3: git tree + ref ─────────────────────────────────────────────
log "step 3/5 — git tree + ref"
REF="${DEPLOY_REF:-$(git rev-parse HEAD)}"
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "(detached)")"
if [ "${SKIP_GIT_CHECK:-0}" = "1" ]; then
  log "SKIP_GIT_CHECK=1 — bypassing cleanliness check"
elif ! git diff --quiet || ! git diff --cached --quiet; then
  if [ "$MODE" = "publish" ]; then
    git status --short >&2
    die "working tree is dirty — commit and push, or set SKIP_GIT_CHECK=1 for a dry-run only."
  fi
  log "warn: working tree is dirty — --publish will refuse until it is clean."
fi
if [ "$MODE" = "publish" ] && [ -z "$(git branch -r --contains "$REF" 2>/dev/null || true)" ]; then
  die "ref $REF is not on any remote branch — push $BRANCH to bmatthews-dexcom/attest before --publish."
fi
log "ref: $REF (branch: $BRANCH)"

# ─── step 4: bdk validate ───────────────────────────────────────────────
log "step 4/5 — bdk validate (conductor + experts)"
if ! run_bdk validate --dir "$CONDUCTOR_DIR" >/tmp/attest-deploy-conductor-validate.log 2>&1; then
  tail -60 /tmp/attest-deploy-conductor-validate.log >&2 || true
  die "bdk validate failed on packages/attest-conductor. See /tmp/attest-deploy-conductor-validate.log."
fi
if ! run_bdk validate --dir "$EXPERTS_DIR" >/tmp/attest-deploy-experts-validate.log 2>&1; then
  tail -60 /tmp/attest-deploy-experts-validate.log >&2 || true
  die "bdk validate failed on packages/attest-experts/agents. See /tmp/attest-deploy-experts-validate.log."
fi
log "validate OK"

mkdir -p "$ARTIFACT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARTIFACT="$ARTIFACT_DIR/$STAMP.json"

# ─── step 5: deploy (or print, if dry-run) ──────────────────────────────
if [ "$MODE" = "dry-run" ]; then
  log "step 5/5 — DRY RUN: would run"
  WOULD_RUN="["
  FIRST=1
  for slug in $SELECTED; do
    if [ "$slug" = "attest-conductor" ]; then
      DIR="$CONDUCTOR_DIR"
    else
      DIR="$EXPERTS_DIR"
    fi
    CMD="bdk deploy --dir $DIR --slug $slug --ref $REF --json"
    if [ -n "${DEPLOY_TEAM:-}" ]; then
      CMD="$CMD --team $DEPLOY_TEAM"
    fi
    printf '    %s\n' "$CMD"
    if [ "$FIRST" = "1" ]; then FIRST=0; else WOULD_RUN="$WOULD_RUN,"; fi
    WOULD_RUN="$WOULD_RUN{\"slug\":\"$slug\",\"would_run\":\"$CMD\"}"
  done
  WOULD_RUN="$WOULD_RUN]"
  cat >"$ARTIFACT" <<EOF
{
  "mode": "dry-run",
  "stamp": "$STAMP",
  "git_ref": "$REF",
  "git_branch": "$BRANCH",
  "selected": "$SELECTED",
  "would_run": $WOULD_RUN,
  "source_repo": "bmatthews-dexcom/attest"
}
EOF
  log "artifact: $ARTIFACT"
  log "DONE — dry-run clean. To deploy: CURSOR_API_KEY=... ./scripts/deploy.sh --publish"
  exit 0
fi

log "step 5/5 — deploying $SELECTED"
RESULTS="["
FIRST=1
for slug in $SELECTED; do
  if [ "$slug" = "attest-conductor" ]; then
    DIR="$CONDUCTOR_DIR"
  else
    DIR="$EXPERTS_DIR"
  fi
  log "deploying $slug"
  DEPLOY_CMD=(deploy --dir "$DIR" --slug "$slug" --ref "$REF" --json)
  if [ -n "${DEPLOY_TEAM:-}" ]; then
    DEPLOY_CMD+=(--team "$DEPLOY_TEAM")
  fi
  if ! run_bdk "${DEPLOY_CMD[@]}" >"/tmp/attest-deploy-$slug.log" 2>&1; then
    tail -60 "/tmp/attest-deploy-$slug.log" >&2 || true
    die "deploy failed for $slug. See /tmp/attest-deploy-$slug.log."
  fi
  DEPLOY_JSON="$(cat /tmp/attest-deploy-$slug.log)"
  STATUS="$(node -e 'let r=""; process.stdin.on("data",d=>r+=d); process.stdin.on("end",()=>{try{const o=JSON.parse(r);process.stdout.write(o.status||o.deployment?.status||"")}catch{process.stdout.write("")}})' <<<"$DEPLOY_JSON")"
  URL="$(node -e 'let r=""; process.stdin.on("data",d=>r+=d); process.stdin.on("end",()=>{try{const o=JSON.parse(r);process.stdout.write(o.url||o.hostedUrl||o.deployment?.url||"")}catch{process.stdout.write("")}})' <<<"$DEPLOY_JSON")"
  if [ "$STATUS" != "running" ]; then
    die "deploy for $slug terminated with status=\"$STATUS\" (expected \"running\")."
  fi
  printf '[deploy publish]   %s → status=%s url=%s\n' "$slug" "$STATUS" "${URL:-"(no URL in response)"}"
  if [ "$FIRST" = "1" ]; then FIRST=0; else RESULTS="$RESULTS,"; fi
  RESULTS="$RESULTS{\"slug\":\"$slug\",\"status\":\"$STATUS\",\"url\":\"${URL}\"}"
done
RESULTS="$RESULTS]"
cat >"$ARTIFACT" <<EOF
{
  "mode": "publish",
  "stamp": "$STAMP",
  "git_ref": "$REF",
  "git_branch": "$BRANCH",
  "deployed": $RESULTS,
  "source_repo": "bmatthews-dexcom/attest"
}
EOF
log "artifact: $ARTIFACT"
log "DONE — deployed: $SELECTED"
