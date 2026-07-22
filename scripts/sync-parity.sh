#!/usr/bin/env bash
# sync-parity.sh — Copie les fichiers web (src/) vers apps/planipret-mobile/src/
# pour résoudre les divergences détectées par audit-parity.mjs
#
# Usage : bash scripts/sync-parity.sh
# À exécuter depuis la racine du repo planipret-standalone (PlaniPret-Mobile-APP)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT_DIR/../.." && pwd)"

WEB_SRC="$ROOT_DIR/src"
MOB_SRC="$REPO_ROOT/apps/planipret-mobile/src"

if [ ! -d "$MOB_SRC" ]; then
  echo "❌ Dossier mobile introuvable : $MOB_SRC"
  echo "   Assurez-vous d'exécuter ce script depuis PlaniPret-Mobile-APP"
  echo "   et que apps/planipret-mobile/ existe deux niveaux au-dessus."
  exit 1
fi

echo "▶ Sync web → mobile"
echo "   Web : $WEB_SRC"
echo "   Mobile : $MOB_SRC"
echo ""

# ── Pages divergentes ──────────────────────────────────────────────────────────
PAGES_DIVERGENT=(
  "pages/planipret/mobile/MAvaChat.tsx"
  "pages/planipret/mobile/MContacts.tsx"
  "pages/planipret/mobile/MHome.tsx"
  "pages/planipret/mobile/MMessages.tsx"
  "pages/planipret/mobile/MMore.tsx"
  "pages/planipret/mobile/MMs365Diagnostics.tsx"
)

for f in "${PAGES_DIVERGENT[@]}"; do
  src="$WEB_SRC/$f"
  dst="$MOB_SRC/$f"
  if [ -f "$src" ]; then
    mkdir -p "$(dirname "$dst")"
    cp "$src" "$dst"
    echo "  ✓ $f"
  else
    echo "  ⚠ Introuvable : $src"
  fi
done

# ── Composants divergents ──────────────────────────────────────────────────────
COMPONENTS_DIVERGENT=(
  "components/planipret/mobile/ActiveCallOverlay.tsx"
  "components/planipret/mobile/AvaChatSheet.tsx"
)

for f in "${COMPONENTS_DIVERGENT[@]}"; do
  src="$WEB_SRC/$f"
  dst="$MOB_SRC/$f"
  if [ -f "$src" ]; then
    mkdir -p "$(dirname "$dst")"
    cp "$src" "$dst"
    echo "  ✓ $f"
  else
    echo "  ⚠ Introuvable : $src"
  fi
done

# ── Nouveau hook useAvaContext ─────────────────────────────────────────────────
HOOK_SRC="$WEB_SRC/hooks/useAvaContext.ts"
HOOK_DST="$MOB_SRC/hooks/useAvaContext.ts"
if [ -f "$HOOK_SRC" ]; then
  mkdir -p "$(dirname "$HOOK_DST")"
  cp "$HOOK_SRC" "$HOOK_DST"
  echo "  ✓ hooks/useAvaContext.ts"
else
  echo "  ⚠ Introuvable : $HOOK_SRC"
fi

echo ""
echo "✅ Sync terminé. Relancez : npm run build:ios"
