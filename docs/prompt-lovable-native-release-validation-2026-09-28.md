# Prompt Lovable — déploiement contrôlé et recette de la release native

Copiez le texte ci-dessous dans Lovable.

---

Tu dois préparer et valider la release native Planiprêt iOS et Android. Ne crée, ne téléverse et n’active **aucune OTA**. Les mises à jour de code mobile doivent passer uniquement par l’App Store et Google Play.

## 1. Périmètre exact du déploiement Edge

Déploie seulement les fonctions et modules suivants depuis la révision source courante :

- `pp-ns-cdr`
- `pp-portal-handoff`
- `_shared/planipret-portal-target.mjs`

Ne déploie aucune autre fonction par opportunité. Ne lance aucune migration SQL.

Conserve exactement les protections d’accès existantes. Ne modifie pas les secrets, les paramètres JWT, les identifiants OAuth, les DID, les devices SIP, les règles d’appel, les files, les answering rules, les numéros, les utilisateurs ou les configurations NetSapiens.

Les quatre tâches suivantes doivent rester suspendues et ne doivent ni être supprimées ni réactivées :

- `pp-devices-expiry-guard-6h`
- `pp-did-guardian-2h`
- `pp-did-guardian-snapshot-daily`
- `pp-did-reconcile-daily`

Ne lance aucun SMS réel, aucun appel réel, aucune mutation NetSapiens et aucun « auto-heal » pendant le déploiement.

## 2. Contrôles backend à exécuter après déploiement

Exécute les contrôles suivants sans exposer de secret ni de données personnelles dans le rapport.

1. Vérifie que `pp-ns-cdr` répond avec JSON et refuse un appel sans session valide.
2. Vérifie dans le code déployé que le rapprochement CDR utilise seulement `ns_call_id`, `ns_callid`, `ns_orig_callid`, `ns_term_callid` ou `ns_cdr_id`. Il est interdit de rapprocher des appels d’après un numéro de téléphone ou une heure approximative.
3. Vérifie que `pp-ns-cdr` ne lance `pp-auto-process-call` que lorsque `save_consent` est `approved`.
4. Vérifie que le traitement post-appel conserve le consentement : sans consentement, aucun enregistrement, transcription, analyse IA ou push Maestro ne doit être effectué.
5. Vérifie que `pp-portal-handoff` rejette une demande non authentifiée.
6. Vérifie avec un compte administrateur autorisé que la destination est `/planipret/admin`.
7. Vérifie avec un compte courtier réel autorisé que la destination est le portail courtier et qu’une demande mobile de chemin admin ne permet jamais d’obtenir `/planipret/admin`.
8. Confirme que les quatre tâches NetSapiens listées ci-dessus sont toujours `active=false`.

Pour les appels réels, n’exécute rien sans une confirmation explicite indiquant les deux appareils de test et les numéros de test autorisés. Si aucune confirmation n’est fournie, limite-toi aux tests de code, authentification et données de test déjà disponibles.

## 3. Contrôles source obligatoires avant build

Valide les changements suivants dans la source mobile avant d’archiver :

- `PpPjsip` iOS accepte uniquement TLS et le port 5061 pour l’AOR `<poste>M`.
- CallKit est le seul chemin de réponse iOS. Le bouton de l’application doit demander `CXAnswerCallAction`; il ne doit pas envoyer un deuxième `200 OK` directement depuis JavaScript.
- L’appel sortant iOS attend la transaction et l’activation CallKit avant l’INVITE PJSIP et l’attachement audio.
- Le mute PJSIP coupe le micro sortant et non l’audio reçu.
- Le moteur PJSIP détache ses connexions média et revient au null device à la désactivation CallKit et à la fin d’appel.
- Android et le web utilisent uniquement `<poste>W` en WSS/JsSIP. Le service Android de fond ne doit pas enregistrer un deuxième agent SIP ni consommer un INVITE qu’il ne peut pas traiter avec SDP/WebRTC/RTP.
- Une réponse JsSIP sans micro réel est refusée et les pistes média locales sont libérées sur fin d’appel ou échec.
- Le toucher du haut-parleur demande ou vérifie l’autorisation microphone. Il n’existe pas de permission iOS/Android séparée pour le haut-parleur. Sur iOS PJSIP, le prompt doit utiliser `PpPjsip.requestMicrophonePermission`, sans ouvrir une piste WebView concurrente pendant un appel CallKit.
- Le bouton haut-parleur doit afficher la route réellement appliquée par le système. En cas de refus ou d’échec, il garde la route courante et ne coupe pas l’appel.
- `pp-portal-handoff` choisit la destination selon le rôle côté serveur : administrateur vers `/planipret/admin`, courtier vers le portail courtier.
- Aucun chemin `CapacitorUpdater.download`, `CapacitorUpdater.next` ou appel `mobile-config` pour télécharger un bundle ne doit rester dans l’application. Une ancienne OTA présente sur un appareil doit être réinitialisée vers le bundle embarqué, puis aucun nouveau bundle distant ne doit être téléchargé.
- L’écran Appels ne doit pas afficher « calls not synced », « appels non synchronisés » ni un bouton de réparation/synchronisation manuelle. Le CDR et la chaîne Maestro doivent être gérés automatiquement côté serveur après consentement.

Exécute et rapporte les résultats de ces commandes de validation dans l’environnement de build :

```bash
npm test
PP_SKIP_AUTOSYNC=1 npm run build
node scripts/verify-mobile-critical.mjs
node scripts/verify-telephony-backend.mjs
node scripts/verify-call-sync-automation.mjs
node scripts/verify-maestro-api.mjs
node scripts/verify-ava-tools.mjs
node scripts/verify-ios-scene.mjs
node scripts/verify-android.mjs
node scripts/verify-sip-bundle.mjs
```

## 4. Construction native sans toucher au branding

Préserve l’équipe Xcode, les identifiants de signature existants, le logo iOS/Android et le splash/branding actuel. Ne change pas l’ancien logo sans instruction explicite.

### iOS

1. Synchronise les sources avec `npx cap sync ios` ou le script de build prévu.
2. Vérifie que `libpjsip.xcframework` est présent et que PJSIP a été compilé avec OpenSSL et TLS. Si nécessaire, exécute le script PJSIP existant avant l’archive.
3. Exécute les contrôles de scène iOS, de plugin registration et de TLS avant archive.
4. Crée une archive de test avec un `CFBundleShortVersionString` supérieur au dernier train fermé App Store Connect et un `CFBundleVersion` inédit.
5. Ne soumets pas encore à Apple tant que la recette physique décrite ci-dessous n’est pas concluante.

### Android

1. Synchronise les sources avec `npx cap sync android`.
2. Vérifie que le manifeste contient `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS` et les permissions de notification nécessaires sans ajouter de permission téléphonique inutile.
3. Compile d’abord un APK debug puis un AAB release avec un `versionCode` inédit dans Play Console.
4. Ne publie pas encore le AAB tant que la recette physique n’est pas concluante.

## 5. Recette physique obligatoire avant toute soumission Store

Demande explicitement une confirmation avant de lancer les appels réels. Après confirmation, documente chaque cas comme **réussi**, **échoué** ou **non testé**. Ne déclare jamais qu’un test a été fait sans journal, appareil et résultat.

### iPhone réel

- Appel entrant avec l’app ouverte, verrouillée et relancée.
- Appel sortant.
- Audio bidirectionnel vérifié indépendamment : le courtier entend le correspondant et le correspondant entend le courtier.
- Écouteur, haut-parleur et Bluetooth.
- Premier toucher haut-parleur avec permission microphone non encore accordée, puis permission accordée, puis route réellement appliquée.
- Mute/unmute.
- Push VoIP avant et après l’INVITE.
- Deux appels successifs.
- Raccrochage local et distant.
- Vérification Xcode des diagnostics CallKit, AVAudioSession, PJSIP/TLS, RTP et enregistrement `<poste>M`.

### Android réel

- Appel entrant et sortant.
- Audio bidirectionnel avec permission microphone refusée puis accordée.
- Écouteur, haut-parleur et Bluetooth.
- Premier plan, arrière-plan, application fermée puis notification d’appel.
- Vérification que seul `<poste>W` est inscrit en WSS et qu’aucun second UAS Android ne répond à l’INVITE.
- Fin d’appel et libération des pistes microphone/WebRTC.
- Vérification Logcat des diagnostics JsSIP/WebRTC, permission et route audio.

### Post-appel et Maestro

Avec un appel explicitement approuvé pour sauvegarde, vérifie le CDR local, le rapprochement avec l’appel mobile, l’enregistrement si disponible, la transcription, l’analyse, puis le push Maestro automatique. Avec un appel non approuvé, vérifie qu’aucune de ces données n’est envoyée. Vérifie également que l’historique mobile ne demande jamais une synchronisation manuelle.

## 6. Rapport attendu

Retourne un rapport concis et factuel avec :

- la révision exacte déployée et buildée ;
- les fonctions Edge réellement déployées ;
- le statut des quatre tâches NetSapiens suspendues ;
- les résultats de chaque commande ;
- les versions iOS et Android prévues, sans inventer de numéros déjà utilisés ;
- les résultats détaillés de la recette physique, ou « non effectuée » si l’autorisation de test n’a pas été donnée ;
- les écarts, blocages et actions restantes ;
- une confirmation explicite que rien n’a modifié DID, devices, règles ou provisioning NetSapiens.

La phrase « prêt à soumettre » n’est autorisée que si les deux builds sont créés et si toutes les recettes iPhone et Android ci-dessus sont réussies. Sinon, écris exactement : « code/build validé, recette physique restante ».
