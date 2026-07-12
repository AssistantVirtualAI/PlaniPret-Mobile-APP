#!/bin/bash
# sync-and-build.sh — Synchronise depuis Lovable et build pour iOS
# Usage: ./sync-and-build.sh
#
# Ce script :
#  1. Répare automatiquement le repo Lovable s'il est corrompu (re-clone)
#  2. Synchronise les fichiers source depuis Lovable vers le standalone
#  3. Restaure les 6 fichiers critiques iOS/Mac depuis GitHub
#  4. Lance le build Vite (~14 secondes)

set -e

LOVABLE_DIR="$HOME/Documents/lovable-planipret"
STANDALONE_DIR="$HOME/Documents/planipret-standalone"
LOVABLE_REPO="https://github.com/AssistantVirtualAI/attach-app-creator-8134a2fa.git"
LOVABLE_BRANCH="Planipret"
GITHUB_RAW="https://raw.githubusercontent.com/AssistantVirtualAI/PlaniPret-Mobile-APP/main"

# ─── Étape 1 : S'assurer que le repo Lovable est sain ────────────────────────
echo "🔄 Vérification du repo Lovable..."

if (cd "$LOVABLE_DIR" 2>/dev/null && git fetch origin 2>/dev/null && git reset --hard "origin/$LOVABLE_BRANCH" 2>/dev/null); then
  echo "  ✅ Repo Lovable à jour"
else
  echo "  ⚠️  Repo Lovable corrompu ou absent — re-clonage en cours..."
  rm -rf "$LOVABLE_DIR"
  git clone --branch "$LOVABLE_BRANCH" --single-branch "$LOVABLE_REPO" "$LOVABLE_DIR"
  echo "  ✅ Repo Lovable re-cloné"
fi

# ─── Étape 2 : Sync fichiers source ──────────────────────────────────────────
echo "📦 Sync fichiers source..."
rsync -a \
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
echo "  ✅ Fichiers synchronisés"

# ─── Étape 3 : Restaurer les fichiers critiques depuis GitHub ─────────────────
echo "🔧 Restauration des fichiers de configuration iOS/Mac..."
curl -sf "$GITHUB_RAW/vite.config.ts"                          -o "$STANDALONE_DIR/vite.config.ts"                          && echo "  ✅ vite.config.ts"     || echo "  ⚠️  vite.config.ts: échec"
curl -sf "$GITHUB_RAW/index.html"                              -o "$STANDALONE_DIR/index.html"                              && echo "  ✅ index.html"         || echo "  ⚠️  index.html: échec"
curl -sf "$GITHUB_RAW/tsconfig.json"                           -o "$STANDALONE_DIR/tsconfig.json"                           && echo "  ✅ tsconfig.json"      || echo "  ⚠️  tsconfig.json: échec"
curl -sf "$GITHUB_RAW/src/integrations/supabase/client.ts"     -o "$STANDALONE_DIR/src/integrations/supabase/client.ts"     && echo "  ✅ supabase/client.ts" || echo "  ⚠️  supabase/client.ts: échec"
curl -sf "$GITHUB_RAW/src/components/auth/MplanipretGuard.tsx" -o "$STANDALONE_DIR/src/components/auth/MplanipretGuard.tsx" && echo "  ✅ MplanipretGuard.tsx"|| echo "  ⚠️  MplanipretGuard.tsx: échec"
curl -sf "$GITHUB_RAW/src/index.tsx"                           -o "$STANDALONE_DIR/src/index.tsx"                           && echo "  ✅ index.tsx"          || echo "  ⚠️  index.tsx: échec"

# ─── Étape 4 : Build ─────────────────────────────────────────────────────────
echo "🔨 Build..."
cd "$STANDALONE_DIR"
npm run build
echo "✅ Terminé ! Lancez : npx cap sync ios && npx cap open ios"
