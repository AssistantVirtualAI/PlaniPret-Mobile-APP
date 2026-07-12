#!/bin/bash
# build-and-open-xcode.sh — Build Vite + sync Capacitor + ouvrir Xcode
# Usage : ./build-and-open-xcode.sh
set -e

STANDALONE_DIR="$HOME/Documents/planipret-standalone"
cd "$STANDALONE_DIR"

echo "🔨 Build Vite..."
npm run build

echo ""
echo "📱 Sync Capacitor iOS..."
./node_modules/.bin/cap sync ios

echo ""
echo "🚀 Ouverture Xcode..."
./node_modules/.bin/cap open ios

echo ""
echo "✅ Prêt ! Xcode est ouvert."
echo "   → Dans Xcode : sélectionner votre iPhone → ▶ Run"
