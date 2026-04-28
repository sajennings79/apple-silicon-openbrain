#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUN_BIN="$(which bun 2>/dev/null || echo "$HOME/.bun/bin/bun")"
LAUNCH_DIR="$HOME/Library/LaunchAgents"
LOG_DIR="$REPO_DIR/logs"

# Find a Python venv with mlx_lm installed (for the LLM server)
MLX_VENV=""
for candidate in "$REPO_DIR/.mlx-venv" "$HOME/.mlx-venv" "$REPO_DIR/embed-service/.venv"; do
  if [ -f "$candidate/bin/python" ] && "$candidate/bin/python" -c "import mlx_lm" 2>/dev/null; then
    MLX_VENV="$candidate"
    break
  fi
done

if [ -z "$MLX_VENV" ]; then
  echo "⚠ No Python venv with mlx_lm found."
  echo "  Create one: python3 -m venv ~/.mlx-venv && ~/.mlx-venv/bin/pip install mlx-lm"
  echo "  Skipping LLM service plist. Other services will still be installed."
fi

mkdir -p "$LOG_DIR" "$LAUNCH_DIR"

echo "=== Installing OpenBrain launchd services ==="
echo "  Repo: $REPO_DIR"
echo "  Bun:  $BUN_BIN"
echo ""

# Helper: generate plist from template
install_plist() {
  local name="$1"
  local src="$REPO_DIR/launchd/$name.plist"
  local dst="$LAUNCH_DIR/$name.plist"

  if [ ! -f "$src" ]; then
    echo "  ✗ Template not found: $src"
    return 1
  fi

  sed \
    -e "s|__HOME__|$HOME|g" \
    -e "s|__REPO__|$REPO_DIR|g" \
    -e "s|__BUN__|$BUN_BIN|g" \
    -e "s|__VENV__|${MLX_VENV:-__VENV__}|g" \
    "$src" > "$dst"

  # Unload if already loaded, then load
  launchctl unload "$dst" 2>/dev/null || true
  launchctl load "$dst"
  echo "  ✓ $name"
}

install_plist "com.openbrain.mcp"
install_plist "com.openbrain.embed"
install_plist "com.openbrain.ui"

if [ -n "$MLX_VENV" ]; then
  install_plist "com.openbrain.llm"
else
  echo "  ⊘ com.openbrain.llm (skipped — no mlx_lm venv)"
fi

echo ""
echo "=== Done ==="
echo "Services are now running. Check with: bun run scripts/health-check.ts"
echo "Logs in: $LOG_DIR/"
echo "To uninstall: bash scripts/uninstall-services.sh"
