# scripts/lib/deploy-common.sh — shared helpers for the attest-cursor
# deploy scripts (scripts/deploy-{mcp,conductor,experts,all}.sh).
#
# Loaded via `source` from each deploy script. Not standalone-executable.
#
# Requires in the caller's scope:
#   BDK_VERSION  — pinned BDK CLI version (default 0.2.27 if unset).
#
# Exposes:
#   run_bdk <args...>              — invoke the pinned BDK CLI with the
#                                    isolated-credential env guards
#                                    documented in the bdk-deploy skill.
#   check_cursor_credential <label> — refuse to proceed when neither
#                                     CURSOR_API_KEY nor CURSOR_SERVICE_ACCOUNT_KEY
#                                     is set. $label is used in the
#                                     error message.

: "${BDK_VERSION:=0.2.27}"

run_bdk() {
  env -u NODE_OPTIONS -u CURSOR_API_KEY_FILE \
    npx --yes "@cursor/bdk@${BDK_VERSION}" "$@"
}

check_cursor_credential() {
  local label="${1:-deploy}"
  if [ -n "${CURSOR_API_KEY:-}" ] || [ -n "${CURSOR_SERVICE_ACCOUNT_KEY:-}" ]; then
    return 0
  fi
  cat >&2 <<EOF
[$label FAIL] no Cursor credential found.

Export either CURSOR_API_KEY (personal) or CURSOR_SERVICE_ACCOUNT_KEY
(service account) and re-run. The BDK CLI refuses deploys without one;
the dry-run path still runs preflight checks but will fail at the real
deploy step without a credential.

  export CURSOR_API_KEY=sk-...
or
  export CURSOR_SERVICE_ACCOUNT_KEY=sa_...

See docs/deploy.md for the full sequence.
EOF
  exit 1
}

warn_missing_credential() {
  local label="${1:-deploy}"
  if [ -n "${CURSOR_API_KEY:-}" ] || [ -n "${CURSOR_SERVICE_ACCOUNT_KEY:-}" ]; then
    return 0
  fi
  cat >&2 <<EOF
[$label warn] no Cursor credential set — dry-run can still complete, but
--publish will refuse until CURSOR_API_KEY (or CURSOR_SERVICE_ACCOUNT_KEY)
is exported in the shell.
EOF
}
