#!/usr/bin/env bash
# Thin wrapper around agents/run-agent.ts so launchd plists and shell users
# don't need to know about Bun's invocation pattern.
#
# Usage:
#   agents/run-agent.sh <path-to-prompt.md>
#
# Env vars (optional):
#   OPENBRAIN_REPO   Path to openbrain repo. Defaults to the script's parent dir.
#   OPENBRAIN_UI_URL Base URL of the openbrain UI server. Default http://127.0.0.1:6279
#   LLM_URL          Base URL of mlx-lm server. Default http://127.0.0.1:8000
#   LLM_MODEL        Override model name passed to the LLM endpoint.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <path-to-prompt.md>" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${OPENBRAIN_REPO:-$(dirname "$SCRIPT_DIR")}"

if [[ ! -f "$REPO_DIR/package.json" ]]; then
  echo "[run-agent] expected openbrain repo at $REPO_DIR — set OPENBRAIN_REPO" >&2
  exit 2
fi

PROMPT_PATH="$1"
if [[ ! -f "$PROMPT_PATH" ]]; then
  # Allow relative-to-agents/prompts/ shorthand
  if [[ -f "$SCRIPT_DIR/prompts/$PROMPT_PATH" ]]; then
    PROMPT_PATH="$SCRIPT_DIR/prompts/$PROMPT_PATH"
  else
    echo "[run-agent] prompt not found: $1" >&2
    exit 3
  fi
fi

cd "$REPO_DIR"
exec bun run agents/run-agent.ts "$PROMPT_PATH"
