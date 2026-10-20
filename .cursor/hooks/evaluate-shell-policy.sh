#!/usr/bin/env bash
# beforeShellExecution — Shape-C policy hook (kind=shell).
#
# Shape-C policy evaluator for shell commands. Delegates to attest-mcp.evaluate_shell_policy via local workspace bin. Additive to block-dangerous.sh — a deny from either stops the shell call.
#
# ATTEST_POLICY_MODE=ENFORCE|LOG_ONLY|OFF (default: LOG_ONLY)
#   ENFORCE  — fail-closed on engine error or deny.
#   LOG_ONLY — log + allow on engine error (dev / policy authoring).
#   OFF      — skip the policy call entirely (local escape hatch).
#
# Local-only invocation chain (NEVER touches npm registry):
#   1. attest-mcp-policy evaluate --kind=shell
#      — dedicated bin from attest-mcp's `bin` field; resolves via
#        ./node_modules/.bin/ after `npm install` at repo root.
#   2. attest-mcp policy --kind=shell
#      — main attest-mcp CLI's `policy` subcommand (compat path).
#   3. HARD FAIL — the hook never shells out to `npx` with the
#      auto-install flag, never passes `--package=…`, never
#      fetches from the npm registry under any flag. attest-mcp is
#      a workspace sibling (packages/attest-mcp/), NOT a
#      published package.
# Contract: reads Cursor hook JSON on stdin, writes a Cursor hook
#           decision JSON on stdout; non-zero exit = engine error.
set -eu

input=$(cat)
mode="${ATTEST_POLICY_MODE:-LOG_ONLY}"

case "$mode" in
  OFF)
    echo '{"continue":true,"permission":"allow"}'
    exit 0
    ;;
  ENFORCE|LOG_ONLY)
    : # fall through
    ;;
  *)
    # Unknown mode — treat as ENFORCE per fail-closed default.
    mode="ENFORCE"
    ;;
esac

deny() {
  reason="$1"
  cat <<EOF
{"continue":true,"permission":"deny","user_message":"BLOCKED by attest Shape-C policy ($reason)","agent_message":"attest-mcp.evaluate_shell_policy denied this shell operation: $reason"}
EOF
  exit 0
}

# Local-only invocation chain. Each resolver only checks local PATH /
# node_modules/.bin; neither reaches the npm registry. The hooks fail
# loudly rather than silently fetching from npm, per the local-only
# hard constraint.
run_engine() {
  if command -v attest-mcp-policy >/dev/null 2>&1; then
    printf '%s' "$input" | attest-mcp-policy evaluate --kind=shell 2>/dev/null
    return $?
  fi
  if command -v attest-mcp >/dev/null 2>&1; then
    printf '%s' "$input" | attest-mcp policy --kind=shell 2>/dev/null
    return $?
  fi
  # HARD FAIL — the hook never shells out to `npx` with the auto-
  # install flag, never passes `--package=…`, never fetches from the
  # npm registry under any flag.
  return 127
}

decision=$(run_engine) || rc=$?
rc="${rc:-0}"

if [ "$rc" -ne 0 ] || [ -z "$decision" ]; then
  if [ "$mode" = "LOG_ONLY" ]; then
    # Engine unavailable — log once (best-effort) and allow through.
    ts=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
    mkdir -p docs/work 2>/dev/null || true
    printf '{"ts":"%s","hook":"evaluate-%s-policy","mode":"LOG_ONLY","engine_rc":%s,"note":"engine unreachable; allowing"}\n' \
      "$ts" "shell" "$rc" >> docs/work/policy-decisions.jsonl 2>/dev/null || true
    cat <<EOF
{"continue":true,"permission":"allow","user_message":"[attest Shape-C policy] attest-mcp policy engine not reachable locally. Neither \`attest-mcp-policy\` nor \`attest-mcp policy\` resolves. attest-mcp is a workspace sibling and MUST be installed locally — do not expect it from the npm registry. Fix: npm install at repo root (packages/* are workspace siblings; attest-mcp is NOT published to npm) (and \`npm --workspace packages/attest-mcp run build\` to produce the dist/ output the bin points at). LOG_ONLY mode — allowing through."}
EOF
    exit 0
  fi
  deny "attest-mcp policy engine not reachable locally. Neither \`attest-mcp-policy\` nor \`attest-mcp policy\` resolves. attest-mcp is a workspace sibling and MUST be installed locally — do not expect it from the npm registry. Fix: npm install at repo root (packages/* are workspace siblings; attest-mcp is NOT published to npm) (and \`npm --workspace packages/attest-mcp run build\` to produce the dist/ output the bin points at)."
fi

printf '%s\n' "$decision"
