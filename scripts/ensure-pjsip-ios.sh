#!/usr/bin/env bash
# Refuse de produire une app iOS sans le moteur d'appel PJSIP natif.
set -euo pipefail
export PP_REQUIRE_PJSIP=1

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FRAMEWORK="$APP_DIR/ios/App/App/Plugins/PpPjsip/Frameworks/libpjsip.xcframework"

if [ ! -d "$FRAMEWORK" ]; then
  if [ "$(uname -s)" != "Darwin" ]; then
    echo "❌ libpjsip.xcframework absent. Le build iOS doit être préparé sur macOS avec npm run ios:oneclick."
    exit 1
  fi
  echo "▶ libpjsip.xcframework absent — compilation obligatoire du moteur PJSIP…"
  bash "$APP_DIR/scripts/build-pjsip-ios.sh"
fi

bash "$APP_DIR/scripts/verify-pjsip-tls.sh" "$FRAMEWORK"
