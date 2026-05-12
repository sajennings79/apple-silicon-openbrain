#!/usr/bin/env bash
# OpenBrain prerequisite installer — idempotent.
#
# Checks and installs everything OpenBrain needs from a clean Apple Silicon
# Mac. Safe to re-run on a healthy machine; each step is a no-op when the
# requirement is already met.
#
# Status lines are line-buffered with stable prefixes so the Mac app can
# stream and parse them.

set -euo pipefail

emit() { printf '[prereqs] %s\n' "$*"; }
fail() { printf '[prereqs] ERROR: %s\n' "$*" >&2; exit 1; }

# 1. Apple Silicon
emit "step=arch checking"
if [[ "$(uname -m)" != "arm64" ]]; then
  fail "step=arch OpenBrain requires Apple Silicon (arm64). Detected: $(uname -m)"
fi
emit "step=arch ok"

# 2. Homebrew
emit "step=brew checking"
if ! command -v brew &>/dev/null; then
  emit "step=brew installing"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Add brew to PATH for the rest of this script
  if [[ -x /opt/homebrew/bin/brew ]]; then eval "$(/opt/homebrew/bin/brew shellenv)"; fi
fi
command -v brew &>/dev/null || fail "step=brew Homebrew install did not put brew on PATH"
emit "step=brew ok"

# 3. brew packages
PACKAGES=(postgresql@17 pgvector redis uv yt-dlp pnpm)
for pkg in "${PACKAGES[@]}"; do
  emit "step=pkg name=$pkg checking"
  if brew list --versions "$pkg" &>/dev/null; then
    emit "step=pkg name=$pkg ok"
  else
    emit "step=pkg name=$pkg installing"
    brew install "$pkg"
    emit "step=pkg name=$pkg ok"
  fi
done

# 4. gogcli — optional (only needed for Gmail integration)
emit "step=pkg name=gogcli checking"
if brew list --versions gogcli &>/dev/null; then
  emit "step=pkg name=gogcli ok"
else
  if brew install gogcli 2>/dev/null; then
    emit "step=pkg name=gogcli ok"
  else
    emit "step=pkg name=gogcli skipped (not in tap; Gmail integration unavailable until installed manually)"
  fi
fi

# 5. brew services
for svc in postgresql@17 redis; do
  emit "step=svc name=$svc checking"
  if brew services list | awk -v s="$svc" '$1==s {print $2}' | grep -q "started"; then
    emit "step=svc name=$svc ok"
  else
    emit "step=svc name=$svc starting"
    brew services start "$svc"
    sleep 1
    emit "step=svc name=$svc ok"
  fi
done

# 6. Node (via nvm if available; otherwise rely on system node 22+)
emit "step=node checking"
if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh"
  if ! nvm ls --no-colors | grep -qE 'lts/\*'; then
    emit "step=node installing-lts"
    nvm install --lts >/dev/null
    nvm alias default 'lts/*' >/dev/null
  fi
  nvm use --lts >/dev/null
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if (( NODE_MAJOR < 22 )); then
  fail "step=node Node 22+ required (found $(node --version 2>/dev/null || echo none)). nvm install --lts && nvm use --lts"
fi
emit "step=node ok version=$(node --version)"

# 7. Bun (runtime; we never use 'bun install' — pnpm handles deps)
emit "step=bun checking"
if ! command -v bun &>/dev/null; then
  emit "step=bun installing"
  curl -fsSL https://bun.sh/install | bash
  if [[ -x "$HOME/.bun/bin/bun" ]]; then export PATH="$HOME/.bun/bin:$PATH"; fi
fi
command -v bun &>/dev/null || fail "step=bun Bun install did not put bun on PATH (check ~/.bun/bin)"
emit "step=bun ok version=$(bun --version)"

# 8. mlx-lm Python venv
MLX_VENV="$HOME/.mlx-venv"
emit "step=mlx-venv checking path=$MLX_VENV"
if [[ ! -x "$MLX_VENV/bin/python" ]] || ! "$MLX_VENV/bin/python" -c "import mlx_lm" &>/dev/null; then
  emit "step=mlx-venv installing"
  python3 -m venv "$MLX_VENV"
  "$MLX_VENV/bin/pip" install --quiet --upgrade pip
  "$MLX_VENV/bin/pip" install --quiet mlx-lm
fi
emit "step=mlx-venv ok"

emit "all done"
