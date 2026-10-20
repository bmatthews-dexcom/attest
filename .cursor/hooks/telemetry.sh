#!/usr/bin/env bash
# postToolUse — append one JSONL row of tool-call actuals to
# docs/work/telemetry.jsonl (counts/identifiers only, never content).
# Disable: EXPERTS_TELEMETRY=0. Mirrors plugins/expert-hooks.ts
# telemetry writer.
set -u
if [ "${EXPERTS_TELEMETRY:-}" = "0" ]; then
  echo '{}'
  exit 0
fi
input=$(cat)
ts=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
dir="docs/work"
mkdir -p "$dir" 2>/dev/null || true
python3 - "$input" "$ts" <<'PY' >> "$dir/telemetry.jsonl" 2>/dev/null || true
import json, sys
raw, ts = sys.argv[1], sys.argv[2]
try:
    d = json.loads(raw)
except Exception:
    sys.exit(0)
row = {
  "ts": ts,
  "source": "cursor-hook",
  "tool": d.get("tool_name"),
  "duration_ms": d.get("duration"),
  "model": d.get("model") or d.get("model_id"),
  "cwd": d.get("cwd"),
}
print(json.dumps(row))
PY
echo '{}'
