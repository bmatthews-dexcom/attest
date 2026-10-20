#!/usr/bin/env bash
# beforeShellExecution — Shape-C policy hook (kind=shell).
#
# Shape-C policy evaluator for shell commands. Delegates to attest-mcp.evaluate_shell_policy. Additive to block-dangerous.sh — a deny from either stops the shell call.
#
# ATTEST_POLICY_MODE=ENFORCE|LOG_ONLY|OFF (default: LOG_ONLY)
#   ENFORCE  — fail-closed on engine error or deny.
#   LOG_ONLY — log + allow on engine error (dev / policy authoring).
#   OFF      — skip the policy call entirely (local escape hatch).
#
# Engine binary: attest-mcp-policy (owned by sibling @bpmforge/attest-mcp).
# Fallback: npx -y @bpmforge/attest-mcp policy --kind=shell
# Contract:  reads Cursor hook JSON on stdin, writes a Cursor hook
#            decision JSON on stdout; non-zero exit = engine error.
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

run_engine() {
  if command -v attest-mcp-policy >/dev/null 2>&1; then
    printf '%s' "$input" | attest-mcp-policy evaluate --kind=shell 2>/dev/null
    return $?
  fi
  if command -v npx >/dev/null 2>&1; then
    printf '%s' "$input" | npx -y @bpmforge/attest-mcp policy --kind=shell 2>/dev/null
    return $?
  fi
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
{"continue":true,"permission":"allow","user_message":"[attest Shape-C policy] attest-mcp policy engine unreachable (rc=$rc); LOG_ONLY mode — allowing through. Install @bpmforge/attest-mcp or flip ATTEST_POLICY_MODE=OFF to silence."}
EOF
    exit 0
  fi
  deny "attest-mcp policy engine unreachable (rc=$rc) and mode=$mode is fail-closed. Install @bpmforge/attest-mcp (or set ATTEST_POLICY_MODE=LOG_ONLY while authoring policies)."
fi

printf '%s\n' "$decision"
