# Diagnostic bugs iOS Planipret — 2026-08-04

## Bug 1 — Décrocher impossible (no_active_call)

### Symptôme
L'appel entrant sonne via CallKit (push VoIP → PpVoipCall → reportNewIncomingCall).
L'UI affiche l'écran "ringing-in" avec le callId `1-7325A429-6A715C2E0001937A-1A1116C0`.
Appuyer sur Décrocher → `PpPjsip.answerCall` → `no_active_call` répété 10+ fois.

### Cause racine
Le push VoIP arrive dans `PpVoipCall.didReceiveIncomingPushPayload` → CallKit sonne.
Mais `PpPjsipEngine.activeCall` est **nil** car PJSIP n'a pas encore reçu l'INVITE SIP.
Le log montre : `[PpSipKeepAlive] VoIP push wake delegated to PJSIP - legacy WSS REGISTER blocked`
Puis `[PpSipKeepAlive] REGISTER skipped: ws_not_open` → PJSIP n'a pas encore de socket ouverte.

L'INVITE SIP arrive APRÈS le push (délai réseau), mais `PpPjsipEngine.handleIncomingCall` n'est jamais
appelé avant que l'utilisateur tape Décrocher.

### Flux attendu
1. Push VoIP → PpVoipCall → CallKit sonne
2. PpVoipCall poste `PpVoipIncomingPush` → PpSipKeepAlive ouvre la socket
3. PJSIP reçoit l'INVITE → `handleIncomingCall` → `activeCall` = callId
4. Utilisateur tape Décrocher → `PpPjsip.answerCall` → OK

### Flux actuel (cassé)
- Étape 3 n'arrive pas avant l'étape 4
- `PpPjsipEngine.answerCall` vérifie `activeCall != nil` → nil → retourne `no_active_call`
- Solution : `answerCall` doit attendre l'INVITE (polling ou callback) avant de répondre

### Fix requis dans PpPjsipEngine.swift
Dans `answerCall()` : si `activeCall == nil`, attendre jusqu'à 8 secondes que `handleIncomingCall`
soit appelé (via DispatchSemaphore ou async/await avec timeout), puis répondre.
Ou : stocker le `pendingAnswerRequest = true` et dans `handleIncomingCall`, si `pendingAnswerRequest`,
répondre automatiquement.

## Bug 2 — Raccrocher ne fonctionne pas (appels sortants)

### Symptôme
Appel sortant lancé, ça sonne, mais le bouton Raccrocher ne raccroche pas.

### Cause racine dans le log
`[hangup] native PJSIP hangup sent` → `PpPjsip.hangupCall` → `{"ok":true}`
Mais l'appel continue de sonner côté distant.

### Cause dans le code
Dans `useMplanipretSoftphone.ts` ligne 1761-1767 :
```ts
if (nativeOwnsAor()) {
  void nativeSip.hangup();
  setPushRing(null);
  setRestCall(null);
  return;
}
```
`nativeSip.hangup()` appelle `PpPjsip.hangupCall({ callId: this.currentCallId })`.
Mais `nativeOutgoingCall` est alimenté par `sip-outgoing-call` event, et `currentCallId`
dans `nativeSipService` est mis à jour par `PpPjsipOutgoingCall` event.
Si `PpPjsipEngine.makeCall` retourne un callId différent de celui stocké dans `outgoingCallId`,
le hangup utilise le mauvais callId.

### Fix requis
Dans `PpPjsipEngine.swift` `hangupCall()` : si `callId` fourni ne correspond pas à `activeCall`,
essayer aussi `outgoingCallId`. Ou : `hangupCall` sans callId doit raccrocher l'appel actif/sortant.

## Bug 3 — Rappel depuis appel manqué ne lance pas l'appel

### Symptôme
Tap sur un appel manqué dans MCalls → ouvre le dialer mais ne compose pas automatiquement.

### Cause
`openDialer(otherNumber(c))` dans MCalls.tsx ligne 601 → `setDialerOpen(true)` dans PlanipretMobile.tsx.
`dialerAutoDial` est `false` par défaut → le dialer s'ouvre mais n'appelle pas.
Fix : `openDialer(otherNumber(c), true)` pour passer `autoDial=true`.

## Bug 4 — Appels manqués ne s'affichent pas dans la page Appels manqués

### Cause probable
La fonction `load()` dans MCalls.tsx appelle `pp-ns-cdr` (NetSapiens API).
Si NS retourne des items, `merged` remplace les données locales.
Les appels manqués PJSIP ne sont pas forcément dans NS CDR immédiatement.
La direction "missed" est calculée depuis `disposition` NS : si NS dit "answered" mais CallKit dit "missed",
la ligne n'apparaît pas dans l'onglet Manqués.

Fix : après un appel manqué PJSIP, insérer une ligne dans `planipret_phone_calls` avec `direction="missed"`.

## Bug 5 — Page Appels/Historique se rafraîchit toutes les 2 secondes

### Cause
Le canal Supabase realtime `planipret-calls:${userId}` déclenche `load()` après 1s de debounce
sur TOUT changement de `planipret_phone_calls`. Si une autre partie de l'app insère/met à jour
des lignes fréquemment (ex: mise à jour de statut d'appel en cours), ça déclenche un refresh
toutes les 1-2 secondes.

Fix : filtrer les events realtime pour n'écouter que les INSERT (pas UPDATE), ou augmenter
le debounce à 5 secondes.

## Build marker actuel
`pp-build-2026-08-02-ring19` (dans le log Xcode — le Mac n'a pas encore le dernier commit)
Dernier commit dans le dépôt : `304e93885` — `pp-build-2026-08-04-pjsip-aor-guard`

## Fichiers clés
- `ios/App/App/Plugins/PpPjsip/PpPjsipEngine.swift` — answerCall, hangupCall, makeCall, activeCall
- `ios/App/App/Plugins/PpVoipCall/PpVoipCall.swift` — handleIncomingCall, CXAnswerCallAction
- `src/lib/planipret/sip/nativeSipService.ts` — answer(), hangup(), currentCallId
- `src/pages/planipret/mobile/MCalls.tsx` — load(), openDialer, realtime refresh
- `src/pages/planipret/PlanipretMobile.tsx` — openDialer(n, autoDial)
