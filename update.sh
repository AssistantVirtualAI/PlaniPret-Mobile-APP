#!/usr/bin/env bash
# update.sh — Mise à jour + build iOS ultra-rapide pour Planiprêt Mobile.
#
# Usage :
#   bash update.sh          # pull + vite build + cap copy + Xcode  (~60-90s)
#   bash update.sh --full   # pull + npm install + cap sync + Xcode  (~5-8min)
#
# Règle : --full seulement si package.json a changé ou si un plugin Capacitor
# a été ajouté/retiré. Pour les changements de code JS/TS, utilise la commande
# sans argument.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

FULL=false
for arg in "$@"; do
  case "$arg" in
    --full) FULL=true ;;
    *) echo "Flag inconnu: $arg (utilise --full pour npm install + pod sync)"; exit 1 ;;
  esac
done

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Planiprêt Mobile — Update & Build iOS  ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── 1. Git pull ──────────────────────────────────────────────────────────────
echo "▶ [1/4] git pull origin main"
BEFORE=$(git rev-parse HEAD)
git pull origin main --ff-only 2>&1 | grep -v "^From\|^  branch\|^warning"
AFTER=$(git rev-parse HEAD)

if [ "$BEFORE" = "$AFTER" ]; then
  echo "   → Déjà à jour, pas de nouveaux commits."
else
  CHANGED=$(git diff --name-only "$BEFORE" "$AFTER")
  echo "   → Nouveaux commits appliqués."
  # Auto-detect si package.json a changé → forcer --full
  if echo "$CHANGED" | grep -q "^package.json$"; then
    echo "   ⚠ package.json modifié → npm install requis (--full activé automatiquement)"
    FULL=true
  fi
fi

# ── 2. npm install (seulement si --full ou package.json changé) ──────────────
if [ "$FULL" = true ]; then
  echo "▶ [2/4] npm install"
  npm install --prefer-offline --silent
else
  echo "▶ [2/4] npm install — ignoré (utilise --full si tu ajoutes une dépendance)"
fi

# ── 3. Vite build ────────────────────────────────────────────────────────────
echo "▶ [3/4] vite build"
npm run build

# ── 4. Capacitor copy ou sync ────────────────────────────────────────────────
if [ "$FULL" = true ]; then
  echo "▶ [4/4] cap sync ios (plugins + pods — peut prendre 3-5 min)"
  export COCOAPODS_DISABLE_STATS=1
  npx cap sync ios
else
  echo "▶ [4/4] cap copy ios (rapide — skip pods)"
  npx cap copy ios
fi

# ── 5. Ouvrir Xcode ──────────────────────────────────────────────────────────
echo ""
echo "▶ Ouverture Xcode..."
if command -v xed >/dev/null 2>&1; then
  xed ios/App/App.xcworkspace
else
  open ios/App/App.xcworkspace
fi

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  ✅ Prêt — Dans Xcode : Cmd+R (~30-60s) ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "  Rappel :"
echo "  • bash update.sh         → changements JS/TS  (~60-90s total)"
echo "  • bash update.sh --full  → nouvelles dépendances ou plugins (~5-8min)"
echo ""
