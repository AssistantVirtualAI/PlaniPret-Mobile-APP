#!/bin/bash
# sync-and-build.sh — Synchronise depuis Lovable et build
# Usage: ./sync-and-build.sh
# Protège les fichiers de configuration standalone (vite.config.ts, index.html, tsconfig.json)
# qui contiennent des optimisations iOS/Mac absentes du repo Lovable.

set -e

LOVABLE_DIR="$HOME/Documents/lovable-planipret"
STANDALONE_DIR="$HOME/Documents/planipret-standalone"

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
  "$LOVABLE_DIR/apps/planipret-mobile/" \
  "$STANDALONE_DIR/"

echo "🔨 Build..."
cd "$STANDALONE_DIR"
npm run build

echo "✅ Terminé !"
