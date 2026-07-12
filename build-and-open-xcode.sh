#!/bin/bash
# build-and-open-xcode.sh — Build rapide + sync Capacitor + ouvrir Xcode
# Usage :
#   ./build-and-open-xcode.sh          → build rapide (sans minification, ~2-3 min)
#   ./build-and-open-xcode.sh prod     → build production (avec minification, ~8 min)
set -e

STANDALONE_DIR="$HOME/Documents/planipret-standalone"
cd "$STANDALONE_DIR"

# ─── Correction Rollup ARM64 ──────────────────────────────────────────────────
if [ "$(uname -m)" = "arm64" ]; then
  ROLLUP_NM="$STANDALONE_DIR/node_modules/rollup"
  WASM_NM="$STANDALONE_DIR/node_modules/@rollup/wasm-node"

  # Si node_modules/rollup contient wasm-node → le supprimer et réinstaller
  if [ -f "$ROLLUP_NM/dist/rollup.wasm.node" ] || grep -q "wasm" "$ROLLUP_NM/package.json" 2>/dev/null; then
    echo "⚠️  Rollup wasm-node détecté — réinstallation du natif ARM64..."
    rm -rf "$ROLLUP_NM" "$WASM_NM"
    npm install --ignore-scripts --prefer-offline --silent 2>/dev/null || npm install --ignore-scripts --silent
    echo "  ✅ Rollup natif réinstallé"
  fi

  # Installer le binaire ARM64 si absent
  ROLLUP_VERSION=$(node -e "console.log(require('./node_modules/rollup/package.json').version)" 2>/dev/null || echo "")
  ROLLUP_ARM64_DIR="$STANDALONE_DIR/node_modules/@rollup/rollup-darwin-arm64"
  if [ ! -d "$ROLLUP_ARM64_DIR" ] && [ -n "$ROLLUP_VERSION" ]; then
    echo "📦 Installation binaire Rollup ARM64..."
    npm install --save-optional "@rollup/rollup-darwin-arm64@$ROLLUP_VERSION" --silent
    echo "  ✅ Rollup ARM64 installé"
  fi
fi

# ─── Build Vite ───────────────────────────────────────────────────────────────
if [ "$1" = "prod" ]; then
  echo "🔨 Build production (avec minification)..."
  npm run build
else
  echo "🔨 Build rapide (sans minification — pour test iOS)..."
  npm run build:fast
fi

echo ""
echo "📱 Sync Capacitor iOS..."
./node_modules/.bin/cap sync ios

echo ""
echo "🚀 Ouverture Xcode..."
./node_modules/.bin/cap open ios

echo ""
echo "✅ Prêt ! Xcode est ouvert."
echo "   → Dans Xcode : sélectionner votre iPhone → ▶ Run"
