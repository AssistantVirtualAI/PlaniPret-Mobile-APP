#!/bin/bash
# sync.sh — Met à jour et rebuild planipret-standalone en une commande
# Usage : ./sync.sh           (build normal, ~30s)
#         ./sync.sh --clean   (réinstalle node_modules, ~3min, si erreurs de build)

set -e
LOVABLE="$HOME/Documents/lovable-planipret"
STANDALONE="$HOME/planipret-standalone"
CLEAN=false

[[ "$1" == "--clean" ]] && CLEAN=true

echo "⬇️  Pull depuis GitHub..."
cd "$LOVABLE" && git pull origin Planipret --quiet

echo "📂 Sync des fichiers sources..."
rsync -a --delete \
  --exclude='node_modules' --exclude='ios' --exclude='android' \
  --exclude='.git' --exclude='dist' \
  --exclude='src/integrations/supabase/client.ts' \
  "$LOVABLE/apps/planipret-mobile/" "$STANDALONE/"

cd "$STANDALONE"

if $CLEAN; then
  echo "🧹 Nettoyage node_modules..."
  rm -rf node_modules
fi

# Réinstaller seulement si package.json a changé ou node_modules absent
if [ ! -d node_modules ] || [ package.json -nt node_modules ]; then
  echo "📦 Installation des dépendances..."
  npm install --silent
fi

echo "🔨 Build..."
npm run build

echo "🔗 Vérification des deep links natifs..."
node scripts/apply-native-config.mjs

echo "📱 Copie vers iOS..."
npx cap copy ios --silent

echo ""
echo "✅ Terminé ! Ouvre Xcode et clique sur ▶ Run."
