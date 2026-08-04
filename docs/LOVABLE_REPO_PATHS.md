# Référence dépôt Lovable — Planipret Mobile

## Dépôt Lovable
- URL : https://github.com/AssistantVirtualAI/attach-app-creator-8134a2fa.git
- Remote local : `lovable`
- Branche : `Planipret`

## Chemin des fichiers Planipret Mobile dans la branche Lovable
Les fichiers de l'app mobile Planipret sont dans le sous-dossier :
```
apps/planipret-mobile/
```

## Fichiers clés (chemins dans lovable/Planipret)
| Fichier | Chemin dans lovable/Planipret | Chemin dans planipret-build |
|---|---|---|
| PpPjsipEngine.swift | apps/planipret-mobile/ios/App/App/Plugins/PpPjsip/PpPjsipEngine.swift | ios/App/App/Plugins/PpPjsip/PpPjsipEngine.swift |
| PpVoipCall.swift | apps/planipret-mobile/ios/App/App/Plugins/PpVoipCall/PpVoipCall.swift | ios/App/App/Plugins/PpVoipCall/PpVoipCall.swift |
| nativePpSipService.ts | apps/planipret-mobile/src/lib/planipret/sip/nativePpSipService.ts | src/lib/planipret/sip/nativePpSipService.ts |
| nativeSipService.ts | apps/planipret-mobile/src/lib/planipret/sip/nativeSipService.ts | src/lib/planipret/sip/nativeSipService.ts |
| useMplanipretSoftphone.ts | apps/planipret-mobile/src/hooks/useMplanipretSoftphone.ts | src/hooks/useMplanipretSoftphone.ts |
| MCalls.tsx | apps/planipret-mobile/src/pages/planipret/mobile/MCalls.tsx | src/pages/planipret/mobile/MCalls.tsx |

## Commande pour extraire un fichier depuis Lovable
```bash
git -C ~/planipret-build show lovable/Planipret:apps/planipret-mobile/CHEMIN_RELATIF > /tmp/fichier
```

## Commande pour fetch la branche Lovable
```bash
cd ~/planipret-build && git fetch lovable Planipret
```
