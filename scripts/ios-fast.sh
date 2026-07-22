#!/usr/bin/env bash
# ios-fast.sh — build iOS incrémental Planiprêt Mobile.
#
# Usage :
#   ./scripts/ios-fast.sh              # JS + cap copy + open Xcode  (~90s-3min)
#   ./scripts/ios-fast.sh --full       # + cap sync + pod install    (~5-10min)
#   ./scripts/ios-fast.sh --dev        # vite --mode development     (encore + rapide)
#
# Différences vs build:ios classique :
#   - `cap copy` au lieu de `cap sync` : skip pod install + plugin refresh
#   - `--dev` : Vite skip minify / gzip report
#   - Cache CocoaPods préservé (pas de --repo-update)
#   - Xcode reste ouvert : Cmd+R recompile en incrémental (~30-90s)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

MODE=fast
DEV=false
for arg in "$@"; do
  case "$arg" in
    --full) MODE=full ;;
    --dev)  DEV=true ;;
    *) echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

echo "▶ [1/4] Vite build ($([ "$DEV" = true ] && echo development || echo production))"
if [ "$DEV" = true ]; then
  npx vite build --mode development
else
  npm run build
fi

if [ "$MODE" = "full" ]; then
  echo "▶ [3/4] Capacitor sync (plugins + pods)"
  export COCOAPODS_DISABLE_STATS=1
  npx cap sync ios
else
  echo "▶ [3/4] Capacitor copy (skip pods — utiliser --full si un plugin natif a changé)"
  npx cap copy ios
fi

echo "▶ [4/4] Ouverture Xcode workspace"
if command -v xed >/dev/null 2>&1; then
  xed ios/App/App.xcworkspace
else
  open ios/App/App.xcworkspace
fi

cat <<'EOF'

✅ Prêt.
   • Dans Xcode : Cmd+R (incrémental, ~30-90s).
   • NE PAS faire Clean Build Folder entre itérations.
   • Si un plugin Capacitor a été ajouté/retiré, relance avec --full.
EOF
