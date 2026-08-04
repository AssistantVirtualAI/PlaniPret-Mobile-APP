#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Planiprêt Mobile — Build iOS en un clic
# Double-cliquez sur ce fichier dans le Finder pour lancer le build complet.
#
# Pour forcer la recompilation de PJSIP :
#   Ouvrez Terminal et lancez : bash "Build iOS.command" --rebuild-pjsip
# ─────────────────────────────────────────────────────────────────────────────

# Se placer dans le dossier du projet (même si lancé depuis le Finder)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

bash scripts/ios-oneclick.sh "$@"
