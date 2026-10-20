#!/usr/bin/env bash
# sessionStart — LOCAL ONLY (cloud agents do not fire sessionStart per
# Cursor docs). If docs/work/STATE.md exists, inject it as
# additional_context so the agent resumes with the last checkpoint. The
# small, cheap replacement for OpenCode's resume-anchor plugin (design
# report §6 "Hooks layer").
set -u
cat >/dev/null
if [ -f "docs/work/STATE.md" ]; then
  python3 - <<'PY'
import json
with open("docs/work/STATE.md","r",encoding="utf-8",errors="replace") as f:
    content = f.read()
print(json.dumps({"additional_context": "attest resume state (docs/work/STATE.md):\n\n" + content}))
PY
else
  echo '{}'
fi
