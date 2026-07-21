#!/bin/bash
# build-and-open-xcode.sh — Build production + sync Capacitor + ouvrir Xcode
# Usage :
#   ./build-and-open-xcode.sh          → build production (avec minification + patches iOS, ~8 min)
#   ./build-and-open-xcode.sh fast     → build rapide SANS patches iOS (déconseillé pour debug)
#
# IMPORTANT: le build production (défaut) est OBLIGATOIRE pour iOS car il applique
# les patches critiques de vendor-react (patchReactCommitRootPlugin) qui empêchent
# le blank screen sur iOS WKWebView. Le mode fast désactive la minification et
# ces patches ne peuvent pas s'appliquer → blank screen garanti.
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
if [ "$1" = "fast" ]; then
  echo "🔨 Build rapide (sans minification — patches iOS désactivés)..."
  echo "⚠️  ATTENTION: ce mode ne patche pas vendor-react → blank screen possible sur iOS"
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
echo "   → Dans Xcode : sélectionner votre iPhone → ▶ Run"
