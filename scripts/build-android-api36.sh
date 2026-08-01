#!/usr/bin/env bash
# =============================================================================
# build-android-api36.sh — Build .aab Planipret Mobile v1.2.2 (API 36)
# À exécuter depuis votre Mac dans ~/planipret-standalone
# =============================================================================
set -e

# ---------------------------------------------------------------------------
# 1. Récupérer le dernier commit (99a3739 — API 36 + versionCode 6)
# ---------------------------------------------------------------------------
cd ~/planipret-standalone
git fetch origin
git reset --hard origin/main

# ---------------------------------------------------------------------------
# 2. Installer les dépendances et construire le bundle web
# ---------------------------------------------------------------------------
npm install
npm run build

# ---------------------------------------------------------------------------
# 3. Synchroniser vers Android
# ---------------------------------------------------------------------------
npx cap sync android

# ---------------------------------------------------------------------------
# 4. Générer le keystore (UNE SEULE FOIS — ignorer si déjà fait)
# ---------------------------------------------------------------------------
# Décommentez et exécutez cette section une seule fois :
#
# keytool -genkey -v \
#   -keystore ~/planipret-release.keystore \
#   -alias planipret \
#   -keyalg RSA -keysize 2048 -validity 10000 \
#   -dname "CN=Planipret, OU=Mobile, O=Planipret Inc, L=Montreal, ST=QC, C=CA"
#
# Ensuite ajoutez ces 4 lignes dans ~/.gradle/gradle.properties :
#   PLANIPRET_KEYSTORE_FILE=/Users/VOTRE_USER/planipret-release.keystore
#   PLANIPRET_KEYSTORE_PASSWORD=VOTRE_MOT_DE_PASSE
#   PLANIPRET_KEY_ALIAS=planipret
#   PLANIPRET_KEY_PASSWORD=VOTRE_MOT_DE_PASSE

# ---------------------------------------------------------------------------
# 5. Générer le .aab signé
# ---------------------------------------------------------------------------
cd ~/planipret-standalone/android
./gradlew bundleRelease

# ---------------------------------------------------------------------------
# 6. Résultat
# ---------------------------------------------------------------------------
AAB_PATH="$HOME/planipret-standalone/android/app/build/outputs/bundle/release/app-release.aab"
if [ -f "$AAB_PATH" ]; then
  echo ""
  echo "✅ Build réussi !"
  echo "   Fichier : $AAB_PATH"
  echo "   Taille  : $(du -sh "$AAB_PATH" | cut -f1)"
  echo ""
  echo "→ Aller sur https://play.google.com/console"
  echo "  Production → Créer une nouvelle version → Téléverser $AAB_PATH"
  echo "  versionCode : 6  |  versionName : 1.2.2"
else
  echo "❌ Le fichier .aab n'a pas été trouvé. Vérifiez les erreurs Gradle ci-dessus."
  exit 1
fi
