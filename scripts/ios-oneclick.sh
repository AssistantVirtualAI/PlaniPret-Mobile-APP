#!/usr/bin/env bash
# ios-oneclick.sh — un seul script : PJSIP + build web + sync iOS + Xcode.
#
# Usage :
#   ./scripts/ios-oneclick.sh              # PJSIP (si absent) → build-sync → ouvre Xcode
#   ./scripts/ios-oneclick.sh --rebuild-pjsip   # force la recompilation de PJSIP
#   ./scripts/ios-oneclick.sh --no-open         # ne pas ouvrir Xcode
#
# Double-clic possible via : apps/planipret-mobile/Build iOS.command
set -euo pipefail

cd "$(cd "$(dirname "$0")/.." && pwd)"

FORCE_PJSIP=false
OPEN_XCODE=true
for arg in "$@"; do
  case "$arg" in
    --rebuild-pjsip) FORCE_PJSIP=true ;;
    --no-open) OPEN_XCODE=false ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "Flag inconnu: $arg"; exit 1 ;;
  esac
done

green() { printf "\033[32m%s\033[0m\n" "$*"; }
red()   { printf "\033[31m%s\033[0m\n" "$*"; }

trap 'red "❌ Échec à l’étape en cours. Corrige l’erreur ci-dessus puis relance ce script."' ERR

if [ "$(uname -s)" != "Darwin" ]; then
  red "Ce script doit être lancé sur macOS (Xcode requis)."
  exit 1
fi

FW="ios/App/App/Plugins/PpPjsip/Frameworks/libpjsip.xcframework"

echo "▶ [1/5] Dépendances npm"
if [ ! -d node_modules ] || [ package.json -nt node_modules ]; then
  npm install
else
  green "  ✓ node_modules à jour"
fi

echo "▶ [2/5] PJSIP (OpenSSL + TLS)"
if [ "$FORCE_PJSIP" = true ] || [ ! -d "$FW" ]; then
  npm run ios:build-pjsip
else
  green "  ✓ libpjsip.xcframework déjà présent (--rebuild-pjsip pour forcer)"
fi

echo "▶ [3/5] Vérification TLS du binaire PJSIP"
bash scripts/verify-pjsip-tls.sh

echo "▶ [4/5] Build web + Capacitor sync iOS"
npm run ios:build-sync

echo "▶ [5/5] Pods + Xcode"
if [ -d ios/App ]; then
  ( cd ios/App && pod install )
fi

if [ "$OPEN_XCODE" = true ]; then
  if command -v xed >/dev/null 2>&1; then xed ios/App/App.xcworkspace; else open ios/App/App.xcworkspace; fi
fi

cat <<'EOF'

✅ Tout est prêt.
   • Dans Xcode : ⇧⌘K (Clean) si les plugins natifs ont changé, puis ⌘R.
   • Valide ensuite via SIP Debug → Test sortant / Test entrant.
EOF
