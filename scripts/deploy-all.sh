#!/usr/bin/env bash
# scripts/deploy-all.sh — orchestrate the whole attest-cursor release.
#
# Order:
#   1. scripts/deploy-mcp.sh         — publish @bpmforge/attest-mcp to npm.
#   2. scripts/deploy-experts.sh     — deploy the three concrete expert BDK agents.
#   3. scripts/deploy-conductor.sh   — deploy the conductor BDK agent last,
#                                      because it depends on the expert peer
#                                      slugs being resolvable.
#
# Default mode: --dry-run. Each child script runs with its own --dry-run
# flag. Nothing hits npm or Cursor's control plane.
#
# --publish mode: each child script runs with --publish. Env wiring:
#
#   * deploy-mcp.sh needs NPM_TOKEN.
#   * deploy-experts.sh + deploy-conductor.sh need either CURSOR_API_KEY
#     or CURSOR_SERVICE_ACCOUNT_KEY.
#
# Rollback instructions live in docs/deploy.md.
#
# Env flags that this script passes through to the child scripts:
#   NPM_TOKEN, CURSOR_API_KEY, CURSOR_SERVICE_ACCOUNT_KEY,
#   CONDUCTOR_SLUG, CONDUCTOR_TEAM, CONDUCTOR_REF,
#   EXPERTS_SUBSET, EXPERTS_TEAM, EXPERTS_REF,
#   SKIP_GIT_CHECK, SKIP_TESTS, BDK_VERSION
#
# Exit codes:
#   0  dry-run OK, OR every child script succeeded.
#   1  any child script failed (subsequent scripts are skipped).
#   2  unknown flag.

set -euo pipefail

MODE="dry-run"
for arg in "$@"; do
  case "$arg" in
    --dry-run) MODE="dry-run" ;;
    --publish) MODE="publish" ;;
    -h|--help)
      sed -n '2,32p' "$0"
      exit 0
      ;;
    *)
      echo "deploy-all: unknown flag: $arg" >&2
      echo "Run \`./scripts/deploy-all.sh --help\` for usage." >&2
      exit 2
      ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

log() { printf '[deploy-all %s] %s\n' "$MODE" "$*"; }
fail() { printf '[deploy-all FAIL] %s\n' "$*" >&2; exit 1; }

FLAG="--$MODE"
STEPS=(
  "mcp:scripts/deploy-mcp.sh"
  "experts:scripts/deploy-experts.sh"
  "conductor:scripts/deploy-conductor.sh"
)

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
log "orchestrating ${#STEPS[@]} deploy step(s), stamp=$STAMP"

for entry in "${STEPS[@]}"; do
  name="${entry%%:*}"
  script="${entry#*:}"
  log "═══════════════════════════════════════════════════════════════════"
  log "step: $name  →  $script $FLAG"
  log "═══════════════════════════════════════════════════════════════════"
  if ! bash "$REPO_ROOT/$script" "$FLAG"; then
    fail "step \"$name\" ($script) failed. Remaining steps skipped. Fix the failure and re-run."
  fi
done

log "═══════════════════════════════════════════════════════════════════"
if [ "$MODE" = "dry-run" ]; then
  log "DONE — every step dry-ran clean. Review artifacts/ then re-run with --publish."
else
  log "DONE — attest-mcp published, experts + conductor deployed."
fi
