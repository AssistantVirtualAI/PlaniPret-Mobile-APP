#!/usr/bin/env bash
# update.sh — Mise à jour + build iOS pour Planiprêt Mobile
#
# Usage :
#   bash update.sh          # pull + build + cap copy + Xcode  (~45-60s)
#   bash update.sh --full   # pull + npm install + cap sync + Xcode  (~5-8min)
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
echo "╔══════════════════════════════════════════╗"
echo "║   Planiprêt Mobile — Update & Build iOS  ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── 1. Git sync (fetch + reset — jamais de merge lent) ───────────────────────
echo "▶ [1/4] git sync"
BEFORE=$(git rev-parse HEAD)
git fetch origin main --quiet
AFTER=$(git rev-parse origin/main)

if [ "$BEFORE" = "$AFTER" ]; then
  echo "   ✓ Déjà à jour"
else
  # Vérifier si package.json change avant le reset
  PKG_CHANGED=$(git diff --name-only "$BEFORE" "$AFTER" 2>/dev/null | grep -c "^package.json$" || true)
  git reset --hard origin/main --quiet
  echo "   ✓ Mis à jour ($(git log --oneline -1))"
  if [ "$PKG_CHANGED" -gt 0 ]; then
    echo "   ⚠ package.json modifié → npm install requis"
    FULL=true
  fi
fi

# ── 2. npm install (seulement si nécessaire) ─────────────────────────────────
if [ "$FULL" = true ]; then
  echo "▶ [2/4] npm install"
  npm install --prefer-offline --silent
  echo "   ✓ Dépendances installées"
else
  echo "▶ [2/4] npm install — ignoré ✓"
fi

# ── 3. Vite build ────────────────────────────────────────────────────────────
echo "▶ [3/4] vite build"
START_BUILD=$SECONDS
npx vite build --logLevel warn
BUILD_TIME=$((SECONDS - START_BUILD))
echo "   ✓ Build terminé en ${BUILD_TIME}s"

# ── 4. Capacitor copy ou sync ────────────────────────────────────────────────
if [ "$FULL" = true ]; then
  echo "▶ [4/4] cap sync ios (pods inclus — 3-5 min)"
  COCOAPODS_DISABLE_STATS=1 npx cap sync ios
else
  echo "▶ [4/4] cap copy ios"
  COCOAPODS_DISABLE_STATS=1 npx cap copy ios
  echo "   ✓ Copié vers Xcode"
fi

# ── 5. Ouvrir Xcode ──────────────────────────────────────────────────────────
echo ""
echo "▶ Ouverture Xcode..."
open ios/App/App.xcworkspace

TOTAL=$SECONDS
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  ✅ Prêt en ${TOTAL}s — Dans Xcode : Cmd+R  ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "  Prochaines fois :"
echo "  • bash update.sh         → changements JS/TS"
echo "  • bash update.sh --full  → nouvelles dépendances"
echo "  • bash watch.sh          → mode watch (recompile en 1-2s)"
echo ""
