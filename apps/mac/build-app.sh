#!/usr/bin/env bash
# Build OpenBrain.app as a regular macOS .app bundle from the SwiftPM build
# output. No codesigning / notarization (deferred per plan; user-installs only).
#
# Usage:
#   bash build-app.sh                # → .build/OpenBrain.app (debugging only)
#   bash build-app.sh --install      # → /Applications/OpenBrain.app
#   bash build-app.sh --package      # → dist/OpenBrain-Install.zip (ready to ship)

set -euo pipefail

cd "$(dirname "$0")"
REPO_ROOT="$(cd ../.. && pwd)"

APP_NAME="OpenBrain"
BUNDLE="$APP_NAME.app"
OUT_DIR=".build"
APP_PATH="$OUT_DIR/$BUNDLE"
VERSION="$(plutil -extract CFBundleShortVersionString raw -o - AppBundle/Info.plist 2>/dev/null || echo "0.1.0")"

echo "→ swift build -c release"
swift build -c release

BIN="$(swift build -c release --show-bin-path)/OpenBrainApp"
if [[ ! -x "$BIN" ]]; then
  echo "✗ executable not found at $BIN"
  exit 1
fi

echo "→ assembling $APP_PATH"
rm -rf "$APP_PATH"
mkdir -p "$APP_PATH/Contents/MacOS" "$APP_PATH/Contents/Resources"

cp "$BIN" "$APP_PATH/Contents/MacOS/$APP_NAME"
cp AppBundle/Info.plist "$APP_PATH/Contents/Info.plist"
# Strip the quarantine xattr so locally-built apps don't trigger Gatekeeper.
# (Doesn't help once the .app is downloaded by the recipient — they'll get
# quarantined again — but useful for Scott's own testing.)
xattr -dr com.apple.quarantine "$APP_PATH" 2>/dev/null || true
touch "$APP_PATH"

echo "✓ Built $APP_PATH"

case "${1:-}" in
  --install)
    DEST="/Applications/$BUNDLE"
    echo "→ installing to $DEST"
    rm -rf "$DEST"
    cp -R "$APP_PATH" "$DEST"
    xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true
    echo "✓ Installed at $DEST"
    echo "  Gatekeeper will warn on first launch — Right-click → Open → Open."
    ;;

  --package)
    DIST_DIR="$REPO_ROOT/dist"
    STAGE="$DIST_DIR/.stage"
    OUT_ZIP="$DIST_DIR/OpenBrain-Install-$VERSION.zip"

    echo "→ staging distribution at $STAGE"
    rm -rf "$DIST_DIR"
    mkdir -p "$STAGE"

    # 1. The .app
    cp -R "$APP_PATH" "$STAGE/"

    # 2. The engine bundle (a tarball of the openbrain repo, sans build cruft).
    #    Using tar with explicit excludes keeps uncommitted Phase 0/1/2 work in,
    #    which `git archive HEAD` would miss.
    echo "→ packaging engine"
    tar --exclude='./node_modules' \
        --exclude='./.git' \
        --exclude='./.env' \
        --exclude='./.tmp' \
        --exclude='./logs' \
        --exclude='./dist' \
        --exclude='./.claude' \
        --exclude='./.playwright-mcp' \
        --exclude='./bun.lock' \
        --exclude='./apps/mac/.build' \
        --exclude='./apps/mac/.swiftpm' \
        --exclude='./apps/mac/Package.resolved' \
        --exclude='./embed-service/.venv' \
        -czf "$STAGE/openbrain-engine.tar.gz" \
        -C "$REPO_ROOT" .

    # 3. The non-technical install README.
    cp "$REPO_ROOT/apps/mac/INSTALL-FOR-CLIENTS.md" "$STAGE/INSTALL.md"

    echo "→ creating zip"
    (cd "$STAGE" && zip -qry "../OpenBrain-Install-$VERSION.zip" .)
    rm -rf "$STAGE"

    SIZE="$(du -sh "$OUT_ZIP" | cut -f1)"
    echo "✓ $OUT_ZIP ($SIZE)"
    echo
    echo "  Send this single zip to the client. INSTALL.md inside walks them"
    echo "  through extracting and launching. Plan to be on Zoom — first launch"
    echo "  needs Gatekeeper bypass and ~10 min of model downloads."
    ;;
esac
