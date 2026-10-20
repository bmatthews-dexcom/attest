#!/usr/bin/env bash
# beforeShellExecution — block destructive bash commands (verbatim port
# of plugins/expert-hooks.ts DANGEROUS_BASH). Cursor contract: read JSON
# from stdin, write {"permission":"allow"|"deny",...} to stdout.
set -eu
input=$(cat)
cmd=$(printf '%s' "$input" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("command",""))' 2>/dev/null || echo "")

deny() {
  reason="$1"
  cat <<EOF
{"continue":true,"permission":"deny","user_message":"BLOCKED: $reason","agent_message":"BLOCKED by attest hook: $reason. If you truly need this, ask the user to run it manually outside Cursor."}
EOF
  exit 0
}

if printf '%s' "$cmd" | grep -Eqi 'rm\s+(-[a-z]*r[a-z]*f|--recursive[[:space:]]+.*--force|-[a-z]*f[a-z]*r)\s+/\s*$|rm\s+-rf\s+/\s*$'; then
  deny "rm -rf / — would delete the entire filesystem"
fi
if printf '%s' "$cmd" | grep -Eqi '\bDROP[[:space:]]+TABLE\b'; then
  deny "DROP TABLE — destructive database operation"
fi
if printf '%s' "$cmd" | grep -Eqi '\bDELETE[[:space:]]+FROM[[:space:]]+[^[:space:]]+[[:space:]]*(;|$)'; then
  if ! printf '%s' "$cmd" | grep -Eqi '\bWHERE\b'; then
    deny "DELETE FROM without WHERE — would delete all rows"
  fi
fi
if printf '%s' "$cmd" | grep -Eqi '\bgit[[:space:]]+push[[:space:]]+.*--force\b|\bgit[[:space:]]+push[[:space:]]+-f\b'; then
  deny "git push --force — would rewrite remote history"
fi
if printf '%s' "$cmd" | grep -Eqi '\bgit[[:space:]]+reset[[:space:]]+--hard\b'; then
  deny "git reset --hard — would discard uncommitted work"
fi
if printf '%s' "$cmd" | grep -Eqi '\bnpm[[:space:]]+publish\b'; then
  deny "attempted npm-registry upload — this project is local-only; no package is pushed to any public registry"
fi
if printf '%s' "$cmd" | grep -Eqi '\bcurl[[:space:]]+.*\|[[:space:]]*bash\b|\bwget[[:space:]]+.*\|[[:space:]]*bash\b'; then
  deny "curl|bash / wget|bash — executing untrusted remote code"
fi

echo '{"continue":true,"permission":"allow"}'
