#!/usr/bin/env bash
# preToolUse (matcher: Write|Edit) — block writes to credential files
# (verbatim port of plugins/expert-hooks.ts BLOCKED_FILE_PATTERNS).
set -eu
input=$(cat)
path=$(printf '%s' "$input" | python3 -c '
import json,sys
d=json.load(sys.stdin)
ti=d.get("tool_input",{}) or {}
print(ti.get("file_path") or ti.get("filePath") or ti.get("path") or "")
' 2>/dev/null || echo "")

deny() {
  reason="$1"
  cat <<EOF
{"permission":"deny","user_message":"BLOCKED: writing to $reason is not allowed","agent_message":"BLOCKED by attest hook: writing to $reason is not allowed. Use environment variables, a secrets manager, or have the user place the file manually."}
EOF
  exit 0
}

if [ -z "$path" ]; then
  echo '{"permission":"allow"}'
  exit 0
fi

base=$(basename "$path")
case "$base" in
  .env|.env.*)
    deny ".env file — use environment variables or a secrets manager"
    ;;
  credentials.json|secrets.json)
    deny "credentials/secrets file"
    ;;
  id_rsa|id_ed25519|id_ecdsa|id_dsa)
    deny "SSH private key"
    ;;
esac

case "$path" in
  *.key|*.pem|*.p12|*.pfx)
    deny "private-key file"
    ;;
esac

echo '{"permission":"allow"}'
