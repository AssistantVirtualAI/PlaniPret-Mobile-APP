#!/bin/bash
# sync-and-build.sh — Synchronise depuis GitHub et build pour iOS
# Usage : ./sync-and-build.sh
#
# RAPIDE : npm install est sauté si package.json n'a pas changé.
# Temps typique : ~15s (build seul) vs ~90s (avec npm install)
set -e

STANDALONE_DIR="$HOME/planipret-standalone"
PKG_HASH_FILE="$STANDALONE_DIR/.pkg_hash"

cd "$STANDALONE_DIR"

# ─── Étape 1 : Récupérer les derniers changements depuis GitHub ───────────────
echo "⬇️  Mise à jour depuis GitHub..."
git fetch origin --quiet
git reset --hard origin/main --quiet
echo "  ✅ Code à jour ($(git log --oneline -1))"

# ─── Étape 2 : npm install seulement si package.json a changé ────────────────
CURRENT_HASH=$(md5 -q package.json 2>/dev/null || md5sum package.json 2>/dev/null | cut -d' ' -f1)
SAVED_HASH=$(cat "$PKG_HASH_FILE" 2>/dev/null || echo "")

if [ "$CURRENT_HASH" != "$SAVED_HASH" ] || [ ! -d node_modules ]; then
  echo "📦 package.json modifié — npm install en cours..."
  npm install --legacy-peer-deps --silent
  echo "$CURRENT_HASH" > "$PKG_HASH_FILE"
  echo "  ✅ Dépendances installées"
else
  echo "  ✅ Dépendances inchangées — npm install sauté"
fi

# ─── Étape 3 : Vérification Rollup natif ARM64 (Mac Silicon) ─────────────────
if [ "$(uname -m)" = "arm64" ]; then
  ROLLUP_NM="$STANDALONE_DIR/node_modules/rollup"
  ROLLUP_ARM64_DIR="$STANDALONE_DIR/node_modules/@rollup/rollup-darwin-arm64"

  # Retirer wasm-node si présent (incompatible ARM64 natif)
  if [ -f "$ROLLUP_NM/dist/rollup.wasm.node" ] || grep -q "wasm" "$ROLLUP_NM/package.json" 2>/dev/null; then
    echo "  ⚠️  Rollup wasm détecté — remplacement par natif ARM64..."
    rm -rf "$ROLLUP_NM" "$STANDALONE_DIR/node_modules/@rollup/wasm-node"
    npm install --ignore-scripts --prefer-offline --silent 2>/dev/null || npm install --ignore-scripts --silent
  fi

  # Installer le binaire natif ARM64 si absent
  if [ ! -d "$ROLLUP_ARM64_DIR" ]; then
    ROLLUP_VERSION=$(node -e "console.log(require('./node_modules/rollup/package.json').version)" 2>/dev/null || echo "")
    if [ -n "$ROLLUP_VERSION" ]; then
      echo "  📦 Installation Rollup natif ARM64 (@$ROLLUP_VERSION)..."
      npm install --save-optional "@rollup/rollup-darwin-arm64@$ROLLUP_VERSION" --silent
      echo "  ✅ Rollup ARM64 installé — build ~10x plus rapide"
    fi
  fi
fi

# ─── Étape 4 : Build ─────────────────────────────────────────────────────────
echo "🔨 Build Vite..."
npm run build

# ─── Étape 5 : Copier vers iOS ───────────────────────────────────────────────
echo "📱 Copie vers iOS..."
npx cap copy ios --silent 2>/dev/null || npx cap copy ios

# ─── Étape 6 : pod install si Pods manquants ─────────────────────────────────
PODS_DIR="$STANDALONE_DIR/ios/App/Pods"
PODS_XCCONFIG="$STANDALONE_DIR/ios/App/Pods/Target Support Files/Pods-App/Pods-App.debug.xcconfig"

if [ ! -f "$PODS_XCCONFIG" ]; then
  echo "🍫 Pods manquants — pod install en cours..."
  if command -v pod &>/dev/null; then
    cd "$STANDALONE_DIR/ios/App"
    pod install --silent && echo "  ✅ Pods installés" || echo "  ⚠️  pod install a échoué — lance manuellement : cd ~/planipret-standalone/ios/App && pod install"
    cd "$STANDALONE_DIR"
  else
    echo "  ⚠️  CocoaPods non installé. Lance :"
    echo "       sudo gem install cocoapods"
    echo "       cd ~/planipret-standalone/ios/App && pod install"
  fi
else
  echo "  ✅ Pods déjà installés"
fi

echo ""
echo "✅ Terminé ! Lance Xcode :"
echo "   npx cap open ios"
