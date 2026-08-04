#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Planiprêt Mobile — Build iOS en un clic
#
# Usage :
#   npm run ios:oneclick              # build complet (PJSIP si absent)
#   npm run ios:oneclick -- --rebuild-pjsip   # force recompilation PJSIP
#   double-clic sur "Build iOS.command"
#
# Étapes :
#   1. npm install
#   2. Compilation libpjsip.xcframework (si absent ou --rebuild-pjsip)
#   3. Vérification TLS du xcframework
#   4. Build Vite + cap sync ios (ios:build-sync)
#   5. pod install (si Podfile.lock absent ou xcframework ajouté)
#   6. Ouverture Xcode
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Couleurs ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'
BOLD='\033[1m'; NC='\033[0m'

step()  { echo -e "\n${BLUE}${BOLD}▶ $*${NC}"; }
ok()    { echo -e "${GREEN}✓ $*${NC}"; }
warn()  { echo -e "${YELLOW}⚠ $*${NC}"; }
fail()  { echo -e "${RED}✗ $*${NC}"; exit 1; }

# ── Répertoire racine du projet ───────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
cd "$APP_DIR"

XCFW="ios/App/App/Plugins/PpPjsip/Frameworks/libpjsip.xcframework"
REBUILD_PJSIP=0

for arg in "$@"; do
  [[ "$arg" == "--rebuild-pjsip" ]] && REBUILD_PJSIP=1
done

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   Planiprêt Mobile — Build iOS en un clic   ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ── Prérequis ─────────────────────────────────────────────────────────────────
step "Vérification des prérequis"
command -v xcodebuild >/dev/null || fail "xcodebuild introuvable — installez Xcode."
command -v xcrun      >/dev/null || fail "xcrun introuvable — installez les Xcode Command Line Tools."
command -v node       >/dev/null || fail "node introuvable — installez Node.js 18+."
command -v npm        >/dev/null || fail "npm introuvable — installez Node.js 18+."
ok "Prérequis OK"

# ── 1. npm install ────────────────────────────────────────────────────────────
step "1/5 — Installation des dépendances npm"
npm install --legacy-peer-deps
ok "npm install terminé"

# ── 2. PJSIP xcframework ──────────────────────────────────────────────────────
if [ "$REBUILD_PJSIP" -eq 1 ]; then
  step "2/5 — Recompilation forcée de libpjsip.xcframework (--rebuild-pjsip)"
  rm -rf "$XCFW"
  # Supprimer aussi le cache de build pour forcer une recompilation complète
  rm -rf "$APP_DIR/.pjsip-build/libs" "$APP_DIR/.pjsip-build/pjproject"
fi

if [ ! -d "$XCFW" ]; then
  step "2/5 — Compilation de libpjsip.xcframework (OpenSSL + pjproject, ~15-20 min)"
  warn "Cette étape est longue. Ne fermez pas ce terminal."
  # Sur Mac Apple Silicon (M1/M2/M3/M4) + Xcode 15+, le simulateur arm64 ne
  # compile pas avec configure-iphone. On force device-only par défaut :
  # l'app fonctionne parfaitement sur iPhone réel avec une seule tranche.
  PJSIP_DEVICE_ONLY=1 bash scripts/build-pjsip-ios.sh
  ok "libpjsip.xcframework compilé → $XCFW"

  # Ajouter automatiquement le xcframework au projet Xcode via ruby/xcodeproj
  step "   Ajout du xcframework au projet Xcode"
  if command -v ruby >/dev/null && gem list xcodeproj -i >/dev/null 2>&1; then
    ruby - "$APP_DIR" "$XCFW" <<'RUBY'
require 'xcodeproj'
app_dir  = ARGV[0]
xcfw_rel = ARGV[1]
proj_path = File.join(app_dir, 'ios/App/App.xcodeproj')
project  = Xcodeproj::Project.open(proj_path)
target   = project.targets.find { |t| t.name == 'App' }
unless target
  puts "  ⚠  Cible 'App' introuvable — ajoutez libpjsip.xcframework manuellement dans Xcode."
  exit 0
end
abs_path = File.expand_path(xcfw_rel, app_dir)
rel_path = Pathname.new(abs_path).relative_path_from(Pathname.new(proj_path).dirname).to_s
# Éviter le doublon
already = project.files.any? { |f| f.path&.include?('libpjsip.xcframework') }
if already
  puts "  ✓ libpjsip.xcframework déjà référencé dans le projet Xcode."
  exit 0
end
ref = project.main_group.new_file(abs_path)
ref.last_known_file_type = 'wrapper.xcframework'
target.frameworks_build_phase.add_file_reference(ref)
project.save
puts "  ✓ libpjsip.xcframework ajouté à la cible App."
RUBY
  else
    warn "gem xcodeproj absent — ajoutez libpjsip.xcframework manuellement dans Xcode :"
    warn "  Cible App → General → Frameworks, Libraries and Embedded Content → + → libpjsip.xcframework → Embed & Sign"
  fi
else
  step "2/5 — libpjsip.xcframework déjà présent"
  ok "Utilisation du xcframework existant (passez --rebuild-pjsip pour forcer)"
fi

# ── 3. Vérification TLS ───────────────────────────────────────────────────────
step "3/5 — Vérification TLS du xcframework"
if [ -f scripts/verify-pjsip-tls.sh ]; then
  bash scripts/verify-pjsip-tls.sh "$XCFW"
  ok "TLS vérifié"
else
  warn "verify-pjsip-tls.sh absent — vérification ignorée"
fi

# ── 4. Build web + cap sync ───────────────────────────────────────────────────
step "4/5 — Build Vite + cap sync iOS"
export PP_SKIP_AUTOSYNC=1
npm run build
npm run precheck:build
npx cap sync ios
node scripts/apply-native-config.mjs
node scripts/strip-obsolete-ios-fallback.mjs
node scripts/verify-no-boot-fallback.mjs
ok "Bundle web synchronisé"

# ── 5. pod install ────────────────────────────────────────────────────────────
step "5/5 — pod install"
if command -v pod >/dev/null; then
  cd ios/App
  pod install --repo-update
  cd "$APP_DIR"
  ok "CocoaPods à jour"
else
  warn "CocoaPods absent — pod install ignoré (installez avec: sudo gem install cocoapods)"
fi

# ── Ouvrir Xcode ──────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║   ✅ Build iOS prêt — ouverture de Xcode     ║${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Dans Xcode :${NC}"
echo -e "  1. ${YELLOW}Product → Clean Build Folder${NC} (⇧⌘K)"
echo -e "  2. ${YELLOW}Run${NC} (⌘R)"
echo ""

open ios/App/App.xcworkspace
