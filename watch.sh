#!/usr/bin/env bash
# watch.sh — Mode développement ultra-rapide pour Planiprêt Mobile iOS
#
# Ce script :
#   1. Fait un git pull pour avoir les derniers changements
#   2. Lance Vite en mode --watch (recompile en ~1-2s à chaque changement)
#   3. Surveille le dossier dist/ et fait cap copy ios automatiquement
#   4. Ouvre Xcode une seule fois
#
# Usage :
#   bash watch.sh        # mode watch continu
#   bash watch.sh --once # build une seule fois + ouvre Xcode (comme update.sh mais plus rapide)
#
# Dans Xcode : Cmd+R pour installer. Après chaque changement de code,
# refaites juste Cmd+R — le dist/ est déjà à jour en ~2 secondes.

set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

ONCE=false
for arg in "$@"; do
  case "$arg" in
    --once) ONCE=true ;;
    *) echo "Flag inconnu: $arg"; exit 1 ;;
  esac
done

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   Planiprêt Mobile — Build iOS Ultra-Rapide  ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── 1. Git pull (rapide — seulement les diffs) ────────────────────────────────
echo "▶ [1/3] git pull origin main"
BEFORE=$(git rev-parse HEAD 2>/dev/null || echo "none")
git fetch origin main --quiet
AFTER=$(git rev-parse origin/main 2>/dev/null || echo "none")

if [ "$BEFORE" != "$AFTER" ]; then
  PKG_CHANGED=$(git diff --name-only "$BEFORE" "$AFTER" 2>/dev/null | grep -c "^package.json$" || true)
  git reset --hard origin/main --quiet
  echo "   ✓ Mis à jour"
  if [ "$PKG_CHANGED" -gt 0 ]; then
    echo "   ⚠ package.json modifié → npm install requis"
    npm install --prefer-offline --silent
    echo "   ✓ npm install terminé"
  fi
else
  echo "   ✓ Déjà à jour"
fi

# ── 2. Build Vite ─────────────────────────────────────────────────────────────
if [ "$ONCE" = true ]; then
  echo "▶ [2/3] vite build (build unique)"
  npx vite build --logLevel warn
  echo "   ✓ Build terminé"

  echo "▶ [3/3] cap copy ios"
  COCOAPODS_DISABLE_STATS=1 npx cap copy ios --inline 2>/dev/null || npx cap copy ios
  echo "   ✓ Copié vers Xcode"

  echo ""
  echo "▶ Ouverture Xcode..."
  open ios/App/App.xcworkspace

  echo ""
  echo "╔══════════════════════════════════════════╗"
  echo "║  ✅ Prêt — Dans Xcode : Cmd+R (~30-60s) ║"
  echo "╚══════════════════════════════════════════╝"
  echo ""
  exit 0
fi

# ── Mode watch : Vite watch + cap copy automatique ────────────────────────────
echo "▶ [2/3] Ouverture Xcode (une seule fois)"
open ios/App/App.xcworkspace &

echo "▶ [3/3] Vite watch + cap copy automatique"
echo ""
echo "  Mode watch actif — chaque changement de code :"
echo "  1. Vite recompile en ~1-2 secondes"
echo "  2. cap copy ios copie automatiquement vers Xcode"
echo "  3. Dans Xcode : Cmd+R pour voir les changements"
echo ""
echo "  Appuyez Ctrl+C pour arrêter."
echo ""

# Nettoyer les processus enfants à la sortie
cleanup() {
  echo ""
  echo "  Watch arrêté."
  kill $(jobs -p) 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

# Lancer Vite en mode watch en arrière-plan
DIST_DIR="$ROOT_DIR/dist"
LAST_BUILD=0

# Fonction qui surveille dist/ et fait cap copy quand il change
watch_and_copy() {
  while true; do
    # Trouver le fichier le plus récent dans dist/
    if [ -d "$DIST_DIR" ]; then
      NEWEST=$(find "$DIST_DIR" -newer "$ROOT_DIR/.last_cap_copy" -type f 2>/dev/null | wc -l)
      if [ "$NEWEST" -gt 0 ] 2>/dev/null; then
        echo "  → dist/ modifié — cap copy ios..."
        COCOAPODS_DISABLE_STATS=1 npx cap copy ios --inline 2>/dev/null || npx cap copy ios 2>/dev/null
        touch "$ROOT_DIR/.last_cap_copy"
        echo "  ✓ Copié — Cmd+R dans Xcode pour voir les changements"
      fi
    fi
    sleep 2
  done
}

# Créer le fichier de référence pour la surveillance
touch "$ROOT_DIR/.last_cap_copy"

# Lancer la surveillance en arrière-plan
watch_and_copy &
WATCHER_PID=$!

# Lancer Vite watch (bloquant — au premier plan)
npx vite build --watch --logLevel warn

# Si Vite se termine, arrêter le watcher
kill $WATCHER_PID 2>/dev/null || true
