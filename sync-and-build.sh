#!/bin/bash
# sync-and-build.sh — Synchronise depuis Lovable et build
# Usage: ./sync-and-build.sh
#
# Protège ET restaure les fichiers de configuration standalone :
#   - vite.config.ts  : optimizeDeps.include pour build rapide (~14s vs 15min)
#   - index.html      : meta iOS, fonts, fond Aurora
#   - tsconfig.json   : sans include vers ../../shared inexistant
#   - integrations/supabase/client.ts : safeStorage iOS
#   - components/auth/MplanipretGuard.tsx : getSession + timeout 4s
#   - src/index.tsx   : délai 50ms + SplashScreen après render

set -e

LOVABLE_DIR="$HOME/Documents/lovable-planipret"
STANDALONE_DIR="$HOME/Documents/planipret-standalone"
GITHUB_RAW="https://raw.githubusercontent.com/AssistantVirtualAI/PlaniPret-Mobile-APP/main"

echo "🔄 Fetch Lovable..."
cd "$LOVABLE_DIR"
git fetch origin
git reset --hard origin/Planipret

echo "📦 Sync fichiers source..."
rsync -av \
  --exclude='node_modules' \
  --exclude='ios' \
  --exclude='android' \
  --exclude='.git' \
  --exclude='dist' \
  --exclude='index.html' \
  --exclude='tsconfig.json' \
  --exclude='vite.config.ts' \
  --exclude='src/integrations/supabase/client.ts' \
  --exclude='src/components/auth/MplanipretGuard.tsx' \
  --exclude='src/index.tsx' \
  "$LOVABLE_DIR/apps/planipret-mobile/" \
  "$STANDALONE_DIR/"

echo "🔧 Restauration des fichiers de configuration iOS/Mac..."
# Forcer la récupération des fichiers critiques depuis GitHub
# pour garantir que les optimisations sont toujours présentes
curl -sf "$GITHUB_RAW/vite.config.ts" -o "$STANDALONE_DIR/vite.config.ts" && echo "  ✅ vite.config.ts restauré" || echo "  ⚠️ vite.config.ts: curl échoué, fichier local conservé"
curl -sf "$GITHUB_RAW/index.html" -o "$STANDALONE_DIR/index.html" && echo "  ✅ index.html restauré" || echo "  ⚠️ index.html: curl échoué, fichier local conservé"
curl -sf "$GITHUB_RAW/tsconfig.json" -o "$STANDALONE_DIR/tsconfig.json" && echo "  ✅ tsconfig.json restauré" || echo "  ⚠️ tsconfig.json: curl échoué, fichier local conservé"
curl -sf "$GITHUB_RAW/src/integrations/supabase/client.ts" -o "$STANDALONE_DIR/src/integrations/supabase/client.ts" && echo "  ✅ supabase/client.ts restauré" || echo "  ⚠️ supabase/client.ts: curl échoué, fichier local conservé"
curl -sf "$GITHUB_RAW/src/components/auth/MplanipretGuard.tsx" -o "$STANDALONE_DIR/src/components/auth/MplanipretGuard.tsx" && echo "  ✅ MplanipretGuard.tsx restauré" || echo "  ⚠️ MplanipretGuard.tsx: curl échoué, fichier local conservé"
curl -sf "$GITHUB_RAW/src/index.tsx" -o "$STANDALONE_DIR/src/index.tsx" && echo "  ✅ index.tsx restauré" || echo "  ⚠️ index.tsx: curl échoué, fichier local conservé"

echo "🔨 Build..."
cd "$STANDALONE_DIR"
npm run build
echo "✅ Terminé !"
