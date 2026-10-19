#!/usr/bin/env bash
# afterFileEdit — format/lint/typecheck/secret-scan the edited file.
# Verbatim port of plugins/expert-hooks.ts tool.execute.after. Fail-open
# on every step: a missing tool is silent, every scanner failure is a
# warning that goes into additional_context so the agent can see it.
set -u
input=$(cat)

# Honor the global disable env the attest plugin uses.
if [ "${EXPERTS_TELEMETRY:-}" = "0" ] && [ "${ATTEST_POST_EDIT:-1}" = "0" ]; then
  echo '{}'
  exit 0
fi

path=$(printf '%s' "$input" | python3 -c '
import json,sys
d=json.load(sys.stdin)
print(d.get("file_path",""))
' 2>/dev/null || echo "")

if [ -z "$path" ] || [ ! -f "$path" ]; then
  echo '{}'
  exit 0
fi

ext=".${path##*.}"
case "$ext" in
  .png|.jpg|.jpeg|.gif|.ico|.svg|.webp|.woff|.woff2|.ttf|.eot|.zip|.tar|.gz|.bz2|.lock|.pyc|.pyo|.so|.dylib|.dll)
    echo '{}'
    exit 0
    ;;
esac

warnings=""
run() { "$@" >/dev/null 2>&1 || true; }

case "$ext" in
  .ts|.tsx|.js|.jsx|.json|.md|.css|.html)
    run prettier --write "$path"
    ;;
  .py)
    run black "$path"
    run isort "$path"
    ;;
  .go)
    run gofmt -w "$path"
    ;;
  .rs)
    run rustfmt "$path"
    ;;
esac

case "$ext" in
  .ts|.tsx|.js|.jsx)
    if command -v eslint >/dev/null 2>&1; then
      out=$(eslint "$path" --max-warnings 0 2>&1 | head -c 2000 || true)
      [ -n "$out" ] && warnings="${warnings}[lint] ${path}\n${out}\n"
    fi
    ;;
  .py)
    if command -v ruff >/dev/null 2>&1; then
      out=$(ruff check "$path" 2>&1 | head -c 2000 || true)
      [ -n "$out" ] && warnings="${warnings}[lint] ${path}\n${out}\n"
    fi
    ;;
esac

case "$ext" in
  .ts|.tsx)
    if command -v tsc >/dev/null 2>&1; then
      out=$(tsc --noEmit --pretty false "$path" 2>&1 | head -c 2000 || true)
      [ -n "$out" ] && warnings="${warnings}[tsc] ${path}\n${out}\n"
    fi
    ;;
esac

# Secret scan — grep the file for the SECRET_PATTERNS registered in
# plugins/expert-hooks.ts.
scan=$(grep -nE \
  -e 'AKIA[0-9A-Z]{16}' \
  -e 'BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY' \
  -e '(api[_-]?key|apikey|api[_-]?secret)[[:space:]]*[:=][[:space:]]*["'"'"'][A-Za-z0-9_-]{16,}["'"'"']' \
  -e '(bearer|token|auth[_-]?token|access[_-]?token)[[:space:]]*[:=][[:space:]]*["'"'"'][A-Za-z0-9_./+=-]{20,}["'"'"']' \
  -e '(postgres|mysql|mongodb|redis|amqp)(ql)?://[^:]+:[^@]+@' \
  "$path" 2>/dev/null | head -c 2000 || true)
if [ -n "$scan" ]; then
  warnings="${warnings}[secret-scan] ${path} — possible secrets found:\n${scan}\nMove these to environment variables or a secrets manager.\n"
fi

if [ -n "$warnings" ]; then
  python3 - <<PY
import json
print(json.dumps({"additional_context": """${warnings}"""}))
PY
else
  echo '{}'
fi
