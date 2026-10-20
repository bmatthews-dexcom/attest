#!/usr/bin/env bash
# scripts/deploy-experts.sh — deploy the attest-experts BDK agents.
#
# Loops over every expert whose status in
# `packages/attest-experts/lib/experts.generated.json` is `concrete`.
# Today that is the three Phase-1 experts: security-auditor, code-reviewer,
# landscape-mapper. When Phase-2 ports flip from `stub` to `concrete` in
# the generated registry, they're picked up automatically — no edits here.
#
# Default mode: --dry-run. Nothing hits Cursor. Preflight runs `bdk validate`
# over the agents/ dir (which registers every expert at once) and prints
# the exact `bdk deploy ...` command that would run per expert.
#
# --publish mode: runs `bdk deploy --dir packages/attest-experts/agents
# --slug <id>` for each concrete expert, serially. The response from each
# is written to artifacts/deploy/experts-<timestamp>.json. If any single
# expert deploy fails, the remaining ones are skipped — no half-states.
#
# Env:
#   CURSOR_API_KEY | CURSOR_SERVICE_ACCOUNT_KEY — required for --publish.
#   EXPERTS_SUBSET  — comma-separated list of expert ids to deploy. Default:
#                     every `concrete` expert. Useful for testing a single
#                     expert without running all three.
#   EXPERTS_TEAM    — override the --team value.
#   EXPERTS_REF     — override the git ref to deploy (default: HEAD).
#   SKIP_GIT_CHECK  — 1 to allow a dirty tree (dry-run bypass).
#   BDK_VERSION     — pinned CLI version (default 0.2.27).
#
# Exit codes:
#   0  dry-run OK, OR every deploy reached `running`.
#   1  preflight failed OR any single deploy failed.
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
      echo "deploy-experts: unknown flag: $arg" >&2
      echo "Run \`./scripts/deploy-experts.sh --help\` for usage." >&2
      exit 2
      ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXPERTS_DIR="$REPO_ROOT/packages/attest-experts"
AGENTS_DIR="$EXPERTS_DIR/agents"
REGISTRY_JSON="$EXPERTS_DIR/lib/experts.generated.json"
ARTIFACT_DIR="$REPO_ROOT/artifacts/deploy"
BDK_VERSION="${BDK_VERSION:-0.2.27}"
LIB_DIR="$REPO_ROOT/scripts/lib"
# shellcheck source=lib/deploy-common.sh
source "$LIB_DIR/deploy-common.sh"

cd "$REPO_ROOT"

log() { printf '[deploy-experts %s] %s\n' "$MODE" "$*"; }
die() { printf '[deploy-experts FAIL] %s\n' "$*" >&2; exit 1; }

log "step 1/5 — resolve concrete expert list"
if [ ! -f "$REGISTRY_JSON" ]; then
  die "experts registry not found at $REGISTRY_JSON (run \`npm --workspace @bpmforge/attest-experts run sync-stubs\`)."
fi

ALL_CONCRETE="$(node -e "
const r = require('$REGISTRY_JSON');
console.log(r.filter(e => e.status === 'concrete').map(e => e.id).join(' '));
")"
if [ -z "$ALL_CONCRETE" ]; then
  die "no concrete experts in $REGISTRY_JSON"
fi

if [ -n "${EXPERTS_SUBSET:-}" ]; then
  SUBSET_LIST="$(echo "$EXPERTS_SUBSET" | tr ',' ' ')"
  SELECTED=""
  for id in $SUBSET_LIST; do
    if ! echo "$ALL_CONCRETE" | tr ' ' '\n' | grep -qx "$id"; then
      die "EXPERTS_SUBSET contains \"$id\" which is not a concrete expert. Concrete: $ALL_CONCRETE"
    fi
    SELECTED="$SELECTED $id"
  done
  SELECTED="$(echo "$SELECTED" | sed 's/^ *//')"
else
  SELECTED="$ALL_CONCRETE"
fi
log "concrete experts: $ALL_CONCRETE"
log "selected: $SELECTED"

log "step 2/5 — check credential"
if [ "$MODE" = "publish" ]; then
  check_cursor_credential "deploy-experts"
else
  warn_missing_credential "deploy-experts"
fi

log "step 3/5 — git tree + ref"
REF="${EXPERTS_REF:-$(git rev-parse HEAD)}"
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

log "step 4/5 — bdk validate (all experts, including stubs)"
if ! run_bdk validate --dir "$AGENTS_DIR" >/tmp/attest-experts-validate.log 2>&1; then
  tail -60 /tmp/attest-experts-validate.log >&2 || true
  die "bdk validate failed. See /tmp/attest-experts-validate.log."
fi
log "validate OK"

mkdir -p "$ARTIFACT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARTIFACT="$ARTIFACT_DIR/experts-$STAMP.json"

if [ "$MODE" = "dry-run" ]; then
  log "step 5/5 — DRY RUN: would deploy per expert"
  RESULTS_JSON="["
  FIRST=1
  for id in $SELECTED; do
    SLUG="attest-expert-$id"
    DEPLOY_PRINT="bdk deploy --dir $AGENTS_DIR --slug $SLUG --ref $REF --json"
    if [ -n "${EXPERTS_TEAM:-}" ]; then
      DEPLOY_PRINT="$DEPLOY_PRINT --team $EXPERTS_TEAM"
    fi
    printf '    %s\n' "$DEPLOY_PRINT"
    if [ "$FIRST" = "1" ]; then FIRST=0; else RESULTS_JSON="$RESULTS_JSON,"; fi
    RESULTS_JSON="$RESULTS_JSON{\"expert\":\"$id\",\"slug\":\"$SLUG\",\"would_run\":\"$DEPLOY_PRINT\"}"
  done
  RESULTS_JSON="$RESULTS_JSON]"
  cat >"$ARTIFACT" <<EOF
{
  "mode": "dry-run",
  "stamp": "$STAMP",
  "ref": "$REF",
  "selected": "$SELECTED",
  "results": $RESULTS_JSON
}
EOF
  log "artifact: $ARTIFACT"
  log "DONE — dry-run clean. To deploy for real: CURSOR_API_KEY=... ./scripts/deploy-experts.sh --publish"
  exit 0
fi

log "step 5/5 — deploying $SELECTED"
RESULTS_JSON="["
FIRST=1
for id in $SELECTED; do
  SLUG="attest-expert-$id"
  log "deploying $SLUG"
  DEPLOY_CMD=(deploy --dir "$AGENTS_DIR" --slug "$SLUG" --ref "$REF" --json)
  if [ -n "${EXPERTS_TEAM:-}" ]; then
    DEPLOY_CMD+=(--team "$EXPERTS_TEAM")
  fi
  if ! run_bdk "${DEPLOY_CMD[@]}" >"/tmp/attest-expert-$id-deploy.log" 2>&1; then
    tail -60 "/tmp/attest-expert-$id-deploy.log" >&2 || true
    die "deploy failed for $SLUG. See /tmp/attest-expert-$id-deploy.log."
  fi
  DEPLOY_JSON="$(cat /tmp/attest-expert-$id-deploy.log)"
  STATUS="$(node -e 'let r=""; process.stdin.on("data",d=>r+=d); process.stdin.on("end",()=>{try{const o=JSON.parse(r);process.stdout.write(o.status||o.deployment?.status||"")}catch{process.stdout.write("")}})' <<<"$DEPLOY_JSON")"
  if [ "$STATUS" != "running" ]; then
    die "deploy for $SLUG terminated with status=\"$STATUS\" (expected \"running\")."
  fi
  log "  $SLUG → status=$STATUS"
  if [ "$FIRST" = "1" ]; then FIRST=0; else RESULTS_JSON="$RESULTS_JSON,"; fi
  RESULTS_JSON="$RESULTS_JSON{\"expert\":\"$id\",\"slug\":\"$SLUG\",\"status\":\"$STATUS\"}"
done
RESULTS_JSON="$RESULTS_JSON]"
cat >"$ARTIFACT" <<EOF
{
  "mode": "publish",
  "stamp": "$STAMP",
  "ref": "$REF",
  "deployed": $RESULTS_JSON
}
EOF
log "artifact: $ARTIFACT"
log "DONE — deployed: $SELECTED"
