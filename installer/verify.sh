#!/usr/bin/env bash
# OpenBrain post-install verification.
#
# Runs `bun run health` and additionally checks that the four core ports are
# listening. Exits 0 only when every required service responds.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

emit() { printf '[verify] %s\n' "$*"; }

cd "$REPO_DIR"

emit "step=ports checking"
required=(6277 6278 8000 6279)
missing=()
for port in "${required[@]}"; do
  if lsof -iTCP:"$port" -sTCP:LISTEN -n -P &>/dev/null; then
    emit "step=ports name=$port ok"
  else
    emit "step=ports name=$port missing"
    missing+=("$port")
  fi
done

emit "step=health"
if bun run health; then
  emit "step=health ok"
else
  emit "step=health failed"
  exit 1
fi

if (( ${#missing[@]} > 0 )); then
  emit "WARN one or more ports not listening: ${missing[*]}"
  emit "Models may still be downloading. Check tail -f $REPO_DIR/logs/llm.log"
  exit 2
fi

emit "all green"
