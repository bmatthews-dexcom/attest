#!/usr/bin/env bash
# stop — if a phase gate script is present, run it and surface the
# unresolved gaps as a followup_message. Keeps the agent from stopping
# before the SDLC phase gate opens, mirroring the
# scripts/validators/run-coverage-loop.sh behavior on OpenCode.
set -u
cat >/dev/null
gate="scripts/validators/validate-phase-gate.sh"
if [ ! -x "$gate" ]; then
  echo '{}'
  exit 0
fi

phase_file="docs/work/.current-phase"
if [ ! -f "$phase_file" ]; then
  echo '{}'
  exit 0
fi
phase=$(cat "$phase_file" 2>/dev/null | tr -d '[:space:]')
if [ -z "$phase" ]; then
  echo '{}'
  exit 0
fi

out=$("$gate" "$phase" 2>&1 | head -c 4000 || true)
code=${PIPESTATUS[0]:-0}
if [ "$code" = "0" ]; then
  echo '{}'
else
  python3 - "$out" "$phase" <<'PY'
import json, sys
out, phase = sys.argv[1], sys.argv[2]
msg = f"[attest end-of-turn gate] phase {phase} is NOT clean. Fix the gaps and continue:\n\n{out}"
print(json.dumps({"followup_message": msg}))
PY
fi
