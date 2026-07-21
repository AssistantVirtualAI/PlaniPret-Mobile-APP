#!/bin/bash
# build-and-open-xcode.sh — Build + sync Capacitor + ouvrir Xcode
#
# Usage :
#   ./build-and-open-xcode.sh          → build production (~30s, patches iOS actifs)
#   ./build-and-open-xcode.sh fast     → build rapide sans minification (~30s, patches iOS inactifs)
#
# NOTE: le mode prod est requis pour les patches vendor-react (Pa() + commitRoot)
# qui empêchent le blank screen sur iOS WKWebView.
set -e

STANDALONE_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$STANDALONE_DIR"

# ─── Vérification et installation des binaires natifs ARM64 ──────────────────
if [ "$(uname -m)" = "arm64" ]; then
  echo "🔍 Vérification des binaires natifs ARM64..."

  # 1. Rollup ARM64 natif
  ROLLUP_VERSION=$(node -e "console.log(require('./node_modules/rollup/package.json').version)" 2>/dev/null || echo "")
  ROLLUP_ARM64_DIR="$STANDALONE_DIR/node_modules/@rollup/rollup-darwin-arm64"

  if [ ! -d "$ROLLUP_ARM64_DIR" ] && [ -n "$ROLLUP_VERSION" ]; then
    echo "  📦 Installation @rollup/rollup-darwin-arm64@$ROLLUP_VERSION..."
    npm install --save-optional "@rollup/rollup-darwin-arm64@$ROLLUP_VERSION" --silent
    echo "  ✅ Rollup ARM64 natif installé"
  else
    echo "  ✅ Rollup ARM64 OK"
  fi

  # 2. SWC ARM64 natif
  SWC_VERSION=$(node -e "console.log(require('./node_modules/@swc/core/package.json').version)" 2>/dev/null || echo "")
  SWC_ARM64_DIR="$STANDALONE_DIR/node_modules/@swc/core-darwin-arm64"

  if [ ! -d "$SWC_ARM64_DIR" ] && [ -n "$SWC_VERSION" ]; then
    echo "  📦 Installation @swc/core-darwin-arm64@$SWC_VERSION..."
    npm install --save-optional "@swc/core-darwin-arm64@$SWC_VERSION" --silent
    echo "  ✅ SWC ARM64 natif installé"
  else
    echo "  ✅ SWC ARM64 OK"
  fi
fi

# ─── Build Vite ───────────────────────────────────────────────────────────────
if [ "$1" = "fast" ]; then
  echo "🔨 Build rapide (sans minification — patches iOS inactifs)..."
  npm run build:fast
else
  echo "🔨 Build production (avec minification + patches iOS React)..."
  npm run build
fi

echo ""
echo "📱 Sync Capacitor iOS..."
./node_modules/.bin/cap sync ios

echo ""
echo "🚀 Ouverture Xcode..."
./node_modules/.bin/cap open ios

echo ""
echo "✅ Prêt ! Xcode est ouvert."
echo "   → Dans Xcode : Product → Clean Build Folder (⇧⌘K) → Run (⌘R)"
