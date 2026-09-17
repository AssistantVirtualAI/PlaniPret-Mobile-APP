# Checklist de release iOS — Planiprêt Mobile

## Push VoIP : sandbox vs production

Un build **Debug lancé depuis Xcode** enregistre toujours son token PushKit dans l'environnement **sandbox** :

```
{"environment":"sandbox","platform":"ios","bundleId":"com.planipret.mobile"}
```

C'est normal et ce n'est **pas** un bug, même si `App.entitlements` déclare `aps-environment = production`. Xcode force le sandbox pour les builds de développement.

Conséquence : les push VoIP envoyés vers `api.push.apple.com` (production) **n'arriveront pas** sur cette installation, donc l'app ne se réveillera pas quand elle est tuée.

### Comment valider correctement

1. Product → Archive dans Xcode.
2. Distribuer via TestFlight (ou Ad Hoc avec profil de distribution).
3. Installer depuis TestFlight, ouvrir l'app, puis vérifier dans les logs serveur (`pp-voip-push-token`) que le token enregistré porte `"environment":"production"`.
4. Faire un appel entrant avec l'app **fermée** (swipe up) : la sonnerie CallKit doit apparaître.

Le backend choisit automatiquement `api.sandbox.push.apple.com` ou `api.push.apple.com` selon le champ `environment` stocké avec le token ; aucun changement de code n'est requis.

## Avant chaque archive

```bash
cd ~/planipret-standalone
rm -rf dist ios/App/App/public
npm run ios:oneclick
```

Le script `ios:oneclick` est obligatoire pour une archive de livraison. Il construit ou vérifie `libpjsip.xcframework`, exige TLS/OpenSSL, l’injecte dans la cible Xcode puis refuse la synchronisation si le module Swift `pjsua` ne peut pas être lié. Une OTA ne contient que le bundle web et ne peut jamais ajouter ce framework à une application déjà installée.
