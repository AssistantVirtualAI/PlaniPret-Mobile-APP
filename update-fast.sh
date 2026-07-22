#!/usr/bin/env bash
# update-fast.sh — Build iOS RAPIDE pour Mac avec peu de RAM
#
# Différences vs update.sh :
#   - Mode "fast" : pas de minification (économise ~1 GB RAM)
#   - Node limité à 1.5 GB max (évite le OOM kill macOS)
#   - treeshake désactivé (économise ~500 MB RAM)
#   - Pas de sourcemap
#
# Usage :
#   bash update-fast.sh          # build rapide (pas minifié — OK pour dev/test)
#   bash update-fast.sh --full   # + npm install + cap sync
#
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"
FULL=false
for arg in "$@"; do
  case "$arg" in
    --full) FULL=true ;;
    *) echo "Flag inconnu: $arg"; exit 1 ;;
  esac
done
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   Planiprêt Mobile — Build iOS RAPIDE (fast)    ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ── 1. Git sync ───────────────────────────────────────────────────────────────
echo "▶ [1/4] git sync"
BEFORE=$(git rev-parse HEAD)
git fetch origin main --quiet
AFTER=$(git rev-parse origin/main)
if [ "$BEFORE" = "$AFTER" ]; then
  echo "   ✓ Déjà à jour"
else
  PKG_CHANGED=$(git diff --name-only "$BEFORE" "$AFTER" 2>/dev/null | grep -c "^package.json$" || true)
  git reset --hard origin/main --quiet
  echo "   ✓ Mis à jour ($(git log --oneline -1))"
  if [ "$PKG_CHANGED" -gt 0 ]; then
    echo "   ⚠ package.json modifié → npm install requis"
    FULL=true
  fi
fi

# ── 2. npm install ────────────────────────────────────────────────────────────
if [ "$FULL" = true ]; then
  echo "▶ [2/4] npm install"
  npm install --prefer-offline --silent
  echo "   ✓ Dépendances installées"
else
  echo "▶ [2/4] npm install — ignoré ✓"
fi

# ── 3. Vite build (mode fast = pas de minification, moins de RAM) ─────────────
echo "▶ [3/4] vite build (mode fast — pas de minification)"
START_BUILD=$SECONDS

# Libérer de la mémoire avant le build
sync

# Limiter Node à 1.5 GB pour éviter le OOM kill macOS
# Mode "fast" désactive minify + treeshake dans vite.config.ts
NODE_OPTIONS="--max-old-space-size=1536" npx vite build --mode fast --logLevel warn

BUILD_TIME=$((SECONDS - START_BUILD))
echo "   ✓ Build terminé en ${BUILD_TIME}s"

# ── 4. Capacitor copy ─────────────────────────────────────────────────────────
if [ "$FULL" = true ]; then
  echo "▶ [4/4] cap sync ios"
  COCOAPODS_DISABLE_STATS=1 npx cap sync ios
else
  echo "▶ [4/4] cap copy ios"
  COCOAPODS_DISABLE_STATS=1 npx cap copy ios
  echo "   ✓ Copié vers Xcode"
fi

# ── 5. Ouvrir Xcode ───────────────────────────────────────────────────────────
echo ""
echo "▶ Ouverture Xcode..."
open ios/App/App.xcworkspace
TOTAL=$SECONDS
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  ✅ Prêt en ${TOTAL}s — Dans Xcode : Cmd+R          ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  Note: build 'fast' = pas minifié (OK pour dev/test)"
echo "  Pour un build production minifié : bash update.sh"
echo ""
