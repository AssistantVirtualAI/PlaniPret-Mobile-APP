#!/usr/bin/env bash
# =============================================================================
# build-android-api36.sh — produit l'AAB local Android cible API 36.
# N'effectue ni git fetch/reset, ni création/modification de keystore.
# =============================================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

VERSION_NAME="$(node -p "require('./package.json').version")"
VERSION_CODE="$(node -p "require('./package.json').androidVersionCode")"
TARGET_SDK="$(sed -n "s/^[[:space:]]*targetSdkVersion[[:space:]]*=[[:space:]]*\([0-9][0-9]*\).*/\1/p" android/variables.gradle | head -n 1)"

if [ "$TARGET_SDK" != "36" ]; then
  echo "❌ targetSdkVersion attendu : 36 ; valeur trouvée : ${TARGET_SDK:-absente}."
  exit 1
fi

if [ ! -f package-lock.json ]; then
  echo "❌ package-lock.json absent ; impossible d'installer les dépendances de façon reproductible."
  exit 1
fi

# ---------------------------------------------------------------------------
# 1. Installer les dépendances verrouillées et construire le bundle web
# ---------------------------------------------------------------------------
npm ci
npm run build

# ---------------------------------------------------------------------------
# 2. Synchroniser le bundle web et la configuration native vers Android
# ---------------------------------------------------------------------------
npx cap sync android

# ---------------------------------------------------------------------------
# 3. Générer l'AAB avec la signature release déjà configurée.
# La tâche Gradle échoue explicitement si les secrets de signature sont absents.
# ---------------------------------------------------------------------------
cd "$APP_DIR/android"
./gradlew bundleRelease

# ---------------------------------------------------------------------------
# 4. Résultat
# ---------------------------------------------------------------------------
AAB_PATH="$APP_DIR/android/app/build/outputs/bundle/release/app-release.aab"
if [ -f "$AAB_PATH" ]; then
  echo ""
  echo "✅ Build réussi !"
  echo "   Fichier : $AAB_PATH"
  echo "   Taille  : $(du -sh "$AAB_PATH" | cut -f1)"
  echo "   targetSdk : $TARGET_SDK"
  echo "   versionCode : $VERSION_CODE | versionName : $VERSION_NAME"
else
  echo "❌ Le fichier .aab n'a pas été trouvé. Vérifiez les erreurs Gradle ci-dessus."
  exit 1
fi
