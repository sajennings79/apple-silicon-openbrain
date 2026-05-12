#!/usr/bin/env bash
# OpenBrain bootstrap — single entry point for first-run installation.
#
# Orchestrates:
#   1. installer/prereqs.sh        (brew + bun + python + mlx-lm)
#   2. .env setup                  (copy .env.example if missing)
#   3. scripts/setup.sh            (DB, schema, Bun deps, uv sync)
#   4. scripts/install-services.sh (launchd plists)
#
# After this completes, the launchd-managed services start downloading models
# in the background. Use installer/verify.sh to check readiness.
#
# Idempotent. Safe to re-run.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

emit() { printf '[bootstrap] %s\n' "$*"; }

emit "step=prereqs"
bash "$REPO_DIR/installer/prereqs.sh"

emit "step=env"
if [[ ! -f "$REPO_DIR/.env" ]]; then
  cp "$REPO_DIR/.env.example" "$REPO_DIR/.env"
  emit "step=env created from .env.example"
else
  emit "step=env ok"
fi

emit "step=setup"
bash "$REPO_DIR/scripts/setup.sh"

emit "step=services"
bash "$REPO_DIR/scripts/install-services.sh"

emit "all done"
emit ""
emit "Next: bash $REPO_DIR/installer/verify.sh"
emit "Models will download on first service start (embed ~30s, LLM ~2min for Qwen3-8B-4bit)."
emit "Tail logs: tail -f $REPO_DIR/logs/llm.log"
