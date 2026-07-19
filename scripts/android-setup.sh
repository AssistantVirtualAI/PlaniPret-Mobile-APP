#!/bin/bash
# android-setup.sh — Initialise la plateforme Android pour Planiprêt Mobile
# Usage: bash scripts/android-setup.sh
set -e

echo "=== Planiprêt Mobile — Android Setup ==="

# 1. Ajouter la plateforme Android si elle n'existe pas
if [ ! -d "android" ]; then
  echo "→ Ajout de la plateforme Android..."
  npx cap add android
else
  echo "→ Plateforme Android déjà présente"
fi

# 2. Build et sync
echo "→ Build + sync Android..."
npm run build
npx cap sync android

# 3. Patch AndroidManifest.xml — ajouter les permissions VoIP/audio manquantes
MANIFEST="android/app/src/main/AndroidManifest.xml"
echo "→ Patch AndroidManifest.xml..."

# Ajouter les permissions si elles ne sont pas déjà présentes
add_permission() {
  local perm="$1"
  if ! grep -q "$perm" "$MANIFEST"; then
    sed -i "s|</manifest>|    <uses-permission android:name=\"$perm\" />\n</manifest>|" "$MANIFEST"
    echo "  + $perm"
  fi
}

add_permission "android.permission.RECORD_AUDIO"
add_permission "android.permission.MODIFY_AUDIO_SETTINGS"
add_permission "android.permission.BLUETOOTH"
add_permission "android.permission.BLUETOOTH_CONNECT"
add_permission "android.permission.USE_SIP"
add_permission "android.permission.INTERNET"
add_permission "android.permission.ACCESS_NETWORK_STATE"
add_permission "android.permission.WAKE_LOCK"
add_permission "android.permission.FOREGROUND_SERVICE"
add_permission "android.permission.RECEIVE_BOOT_COMPLETED"

echo "→ Ouverture dans Android Studio..."
npx cap open android

echo ""
echo "=== Android Setup terminé ==="
echo ""
echo "Dans Android Studio :"
echo "  1. Build > Clean Project"
echo "  2. Build > Rebuild Project"
echo "  3. Run > Run 'app' (sélectionner un émulateur ou appareil)"
