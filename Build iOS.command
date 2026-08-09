#!/usr/bin/env bash
# Double-clique ce fichier dans le Finder pour lancer le build iOS complet.
cd "$(dirname "$0")"
bash scripts/ios-oneclick.sh "$@"
status=$?
echo ""
echo "Appuie sur Entrée pour fermer cette fenêtre."
read -r _
exit $status
