# Analyse logs Xcode — Appels tombent en boîte vocale

## Problème central identifié
Le SIP ne parvient JAMAIS à s'enregistrer (loggedIn reste false tout au long des logs).
Le statut oscille en boucle : ws_connecting → register_sent → register_auth_sent → ws_closed → reconnect.

## Preuves dans les logs

### 1. Token VoIP vide — PushKit ne fonctionne pas
```
[PpVoipCall] no VoIP token cached, re-arming PushKit
token: ""  (vide à chaque tentative)
[pp-voip] empty VoIP token received {"source":"refresh"}
[PpVoipCall] VoIP token after refresh changed=no empty=yes
```
**Conséquence** : Sans token VoIP valide, le PBX ne peut pas envoyer de push VoIP pour réveiller l'app en arrière-plan → l'app n'est pas enregistrée → appel → boîte vocale.

### 2. Connexion WSS échoue immédiatement
```
nw_flow_add_write_request [C1 64.26.133.72:9002 failed parent-flow] cannot accept write requests
Send failed with error "Socket is not connected"
[PpSipKeepAlive] socket closed: Error Domain=NSPOSIXErrorDomain Code=57 "Socket is not connected"
```
Le socket WSS vers wss://core1.cluster1.ucstack.io:9002 s'ouvre mais se ferme immédiatement (code 1001) avant que le REGISTER puisse être confirmé.

### 3. Boucle infinie register_auth_sent sans jamais loggedIn=true
Des centaines de lignes `register_auth_sent` avec `loggedIn:false` — le serveur SIP répond au REGISTER avec un 401 (challenge), l'app envoie le REGISTER avec auth, mais la connexion WSS tombe avant la réponse 200 OK.

### 4. environment: "sandbox" au lieu de "production"
```
{"environment":"sandbox","token":"","platform":"ios","bundleId":"com.planipret.mobile"}
```
L'app tourne en mode sandbox (dev) — les push VoIP sandbox nécessitent un certificat APNs sandbox valide.

## Causes racines

1. **Token VoIP vide** : PushKit ne génère pas de token → soit le certificat APNs VoIP n'est pas configuré dans Xcode, soit l'entitlement `com.apple.developer.networking.networkextension` ou `voip` manque dans le profil de provisionnement.

2. **WSS instable** : Le socket se ferme avant que le REGISTER 200 OK arrive. Durée de vie du socket trop courte. Le PBX coupe la connexion WebSocket inactive avant que l'auth SIP soit complète.

3. **Boucle reconnect trop agressive** : `startSipService` est appelé plusieurs fois en parallèle (lignes 175, 226, 245, 608, 635) créant des connexions concurrentes qui s'annulent mutuellement.

## Fixes nécessaires

### Fix 1 — VoIP token vide (CRITIQUE)
Dans `PpVoipCall.swift` : vérifier que `PKPushRegistry` est initialisé avec `.voIP` et que le delegate est correctement assigné. Ajouter un log explicite si `pushRegistry(_:didUpdate:for:)` n'est jamais appelé.

### Fix 2 — Connexions SIP concurrentes
Dans `ppSipProvider.ts` ou `nativePpSipService.ts` : ajouter un mutex/guard pour éviter d'appeler `startSipService` si une connexion est déjà en cours (`status === "connecting"`).

### Fix 3 — WSS keep-alive
Augmenter le timeout de reconnexion initial de 1000ms à 3000ms pour laisser le temps au REGISTER d'être confirmé avant que le socket soit considéré comme mort.

### Fix 4 — pp-sync-answering-rules
Vérifier que la règle de sonnerie pour l'extension 113 inclut bien `113_mobile` ET `113_web` ET `113x` et que le délai avant boîte vocale est ≥ 30 secondes.
