#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Planiprêt Mobile — Script de build iOS
# Usage: ./scripts/ios-build.sh [release|debug]
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

APP_ID="com.planipret.mobile"
APP_NAME="Planiprêt"
BUILD_TYPE="${1:-debug}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"

echo "🏠 Planiprêt Mobile — Build iOS ($BUILD_TYPE)"
echo "   App ID : $APP_ID"
echo "   Dossier: $APP_DIR"
echo ""

# 1. Vérification des prérequis
if ! command -v npx &> /dev/null; then
    echo "❌ npx non trouvé. Installez Node.js 18+."
    exit 1
fi

# 2. Installation des dépendances
echo "📦 Installation des dépendances..."
cd "$APP_DIR"
npm install --legacy-peer-deps

# 3. Audit + build Vite de l'app mobile uniquement
echo "🔎 Audit app mobile autonome..."
npm run audit:native

echo "🔨 Build Vite Planiprêt Mobile uniquement..."
npm run build

# 4. Synchronisation Capacitor
echo "⚡ Synchronisation Capacitor iOS..."
npx cap sync ios

# 5. Vérification de la configuration
echo "✅ Vérification de la configuration..."
if [ ! -d "ios/App" ]; then
    echo "⚠️  Dossier ios/ non trouvé. Initialisation..."
    npx cap add ios
    npx cap sync ios
fi

# 6. Ouverture Xcode (mode debug) ou build archive (mode release)
if [ "$BUILD_TYPE" = "release" ]; then
    echo "📦 Build archive pour App Store Connect..."
    xcodebuild \
        -workspace ios/App/App.xcworkspace \
        -scheme App \
        -configuration Release \
        -archivePath "build/Planipret-$(date +%Y%m%d-%H%M%S).xcarchive" \
        archive \
        CODE_SIGN_IDENTITY="iPhone Distribution" \
        DEVELOPMENT_TEAM="VOTRE_TEAM_ID"
    echo "✅ Archive créée dans build/"
else
    echo "🚀 Ouverture Xcode..."
    npx cap open ios
fi

echo ""
echo "✅ Build Planiprêt Mobile iOS terminé !"
echo ""
echo "📋 Prochaines étapes :"
echo "   1. Dans Xcode → Signing & Capabilities → Bundle ID: $APP_ID"
echo "   2. Ajouter les certificats APNs Planiprêt (distincts de Lemtel)"
echo "   3. Configurer les Push Notifications avec le bon App ID"
