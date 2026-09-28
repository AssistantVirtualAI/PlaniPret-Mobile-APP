# Rapport de préparation — release native Planiprêt

**Date :** 28 septembre 2026
**Auteur :** Manus AI
**Décision actuelle :** le code est prêt pour la **construction de candidats de release iOS et Android** après le déploiement ciblé des deux fonctions Edge indiquées ci-dessous. Il n’est pas encore possible d’affirmer que les appels sont fonctionnels sur appareils : la recette iPhone et Android n’a pas encore été exécutée avec de vrais appels.

## Conclusion

La capture « 5 calls not synced » ne signifie pas qu’un courtier doit synchroniser ses appels manuellement. Elle indique que des lignes locales plus anciennes n’avaient pas encore été rapprochées d’un CDR NetSapiens final. Un CDR est l’enregistrement final publié par le PBX après la fin d’un appel. Jusqu’ici, l’écran affichait cette situation comme une action à refaire manuellement.

Le correctif remplace ce mécanisme par une chaîne automatique côté serveur. Lorsqu’un CDR arrive, il est rapproché d’un appel mobile existant seulement au moyen d’un identifiant SIP ou CDR immuable. Le système ne rapproche jamais deux appels d’après un numéro ou une heure approximative. Si l’appel a reçu le consentement explicite de sauvegarde, la chaîne post-appel est placée en arrière-plan et la synchronisation Maestro existante est déclenchée. Le consentement reste obligatoire : il ne serait pas correct d’envoyer à Maestro une transcription, un enregistrement ou une analyse d’un appel non approuvé.

Le message et son bouton « Reload » ont été retirés de l’application. Les appels restent visibles pendant le bref délai normal de publication du CDR, sans demander au courtier de réparer l’historique. Les lignes historiques déjà en attente ne sont pas supprimées automatiquement : leur rapprochement ne doit pas être deviné ni réécrit sans preuve SIP.

## Changements inclus dans la release native

### Appels iOS

La release conserve le moteur PJSIP iOS sur l’AOR mobile `<poste>M`, avec TLS sur le port 5061 uniquement. CallKit est le seul chemin qui lance la réponse entrante. L’appel sortant attend l’acceptation et l’activation CallKit avant de créer l’INVITE et d’attacher le média. Ces règles évitent les réponses SIP doubles, les INVITE trop précoces et les conflits de session audio qui pouvaient produire un appel connecté sans son.

Le moteur relâche les connexions média à la fin de l’appel, remet le périphérique audio PJSIP à l’état neutre et corrige la direction du mute afin de couper le micro sortant, plutôt que le son reçu. Les tentatives de reconfiguration concurrente de l’AVAudioSession par le keepalive sont neutralisées quand CallKit ou PJSIP est propriétaire de l’appel.

### Appels Android et web

Android et le web restent exclusivement sur l’AOR `<poste>W` en WSS avec JsSIP/WebRTC. Le faux service Android qui consommait un INVITE sans pouvoir établir le SDP, le WebRTC et le RTP est remplacé par un réveil/notification : il ne s’enregistre plus comme un deuxième agent SIP et ne prétend plus répondre à l’appel en arrière-plan. La réponse WebRTC exige désormais un micro réel et libère les pistes média lors de la fin d’appel ou d’un échec.

Cela protège l’intégrité de la signalisation. Il ne remplace pas une pile média native Android complète en arrière-plan. La recette Android devra donc vérifier explicitement l’appel entrant lorsque l’application est au premier plan, en arrière-plan et après une notification.

### Haut-parleur et autorisation microphone

iOS et Android ne disposent pas d’une permission système distincte pour le haut-parleur. La permission requise est celle du **microphone**, qui conditionne la session audio VoIP.

Sur iOS PJSIP, le premier toucher explicite du haut-parleur utilise maintenant un bridge natif pour présenter ou vérifier l’autorisation microphone. Il ne crée pas une piste `getUserMedia` WebView concurrente pendant qu’un appel CallKit possède l’audio. Sur Android et WebRTC, le même toucher utilise le prompt microphone Capacitor/WebView et libère immédiatement sa piste de contrôle avant d’appliquer la route. Si l’autorisation est refusée, la route n’est pas modifiée et le message indique comment l’autoriser dans les réglages du téléphone.

Le changement de route reste une demande à CallKit ou à l’audio Android, puis l’application lit la route réellement obtenue. Elle ne présente donc pas « haut-parleur » si le système a conservé l’écouteur ou un périphérique Bluetooth.

### Portail AVA

Le bouton « Ouvrir mon portail AVA Statistic » passe par une fonction serveur qui décide la destination à partir du rôle authentifié. Les administrateurs autorisés sont dirigés vers `/planipret/admin`; les courtiers sont dirigés vers le portail courtier. Un chemin demandé par le client mobile ne peut pas contourner ce contrôle de rôle. Le déploiement de cette fonction est encore requis pour que le comportement soit actif en production.

### Distribution par les stores uniquement

L’application ne télécharge plus, n’installe plus et n’affiche plus de release OTA. Au démarrage, si une ancienne OTA Capgo est encore sélectionnée sur un appareil, l’application la réinitialise vers le bundle embarqué dans la release Store. Les mises à jour Planiprêt passent ensuite uniquement par l’App Store et Google Play.

## Validation effectuée dans le Sandbox

| Contrôle | Résultat | Limite |
| --- | --- | --- |
| Tests unitaires mobiles source | 37 fichiers, 174 tests réussis | Ce sont des tests JavaScript/React, pas des appels réels. |
| Tests unitaires dépôt de livraison | 53 fichiers, 288 tests réussis | Inclut les tests portail et mobile dans la copie standalone. |
| Tests ciblés OTA et audio | 8 tests réussis | Le prompt natif iOS est simulé. |
| Build WebView de production | Réussi avec `PP_SKIP_AUTOSYNC=1 npm run build` | Le bundle n’est pas encore archivé par Xcode. |
| Invariants téléphonie backend | Réussis | Analyse de code, pas de CDR de production traité. |
| Contrat Maestro | 20/20 opérations documentées validées | Aucun secret administrateur Maestro n’a été ajouté. |
| Contrat AVA | 81/81 outils et 25 outils sensibles protégés | Aucun SMS ou appel réel n’a été envoyé. |
| Contrôle de distribution OTA | Réussi | Aucun téléchargement OTA n’est encore possible dans le code. |
| Android natif local | APK debug compilé avec succès dans le dépôt standalone | Aucun téléphone ou émulateur n’était connecté au Sandbox. |
| iOS / CallKit / PJSIP réel | Non exécuté | Nécessite un iPhone, un framework PJSIP TLS compilé et un appel consenti. |
| Android / WebRTC réel | Non exécuté | Nécessite un téléphone Android et des appels consentis. |

Les avertissements React Router et SVG observés dans les tests ne font échouer aucun test. Ils ne concernent pas la téléphonie.

## Déploiement backend nécessaire avant la recette

Le code préparé ne modifie aucune configuration NetSapiens. Il ne réactive pas les quatre tâches d’écriture suspendues. Le seul déploiement backend requis est :

1. `pp-ns-cdr`, afin d’activer le rapprochement automatique basé sur les identifiants SIP/CDR et le déclenchement post-appel après consentement.
2. `pp-portal-handoff` et le module partagé `planipret-portal-target.mjs`, afin d’activer la redirection administrateur/courtier décidée côté serveur.

Aucune migration, aucun secret, aucune permission JWT, aucun DID, device, règle d’appel ou tâche planifiée ne doit être modifié par ce déploiement. Les quatre tâches d’écriture NetSapiens restent suspendues.

## Recette obligatoire avant soumission Store

La release doit être considérée comme **candidate à tester**, et non comme validée en production, tant que cette recette n’est pas terminée sur appareils réels.

Sur iPhone, tester un appel entrant et un appel sortant avec l’application ouverte, verrouillée et relancée. Vérifier séparément le son entendu localement et par le correspondant sur écouteur, haut-parleur et Bluetooth. Tester l’autorisation microphone, le mute, le raccrochage local et distant, deux appels successifs, un push VoIP avant et après l’INVITE, et le retour de la route audio réelle dans l’interface.

Sur Android, tester un appel entrant et sortant avec microphone autorisé, l’ouverture par notification, le premier plan, l’arrière-plan, le haut-parleur, le Bluetooth et le nettoyage audio après raccrochage. Confirmer qu’un seul AOR WSS `<poste>W` est enregistré et qu’aucun second UAS Android ne consomme l’INVITE.

Pour chaque appel consenti à sauvegarder, vérifier ensuite le CDR local, l’absence du message manuel de resynchronisation, la création du post-appel, l’enregistrement éventuel, la transcription, l’analyse et la synchronisation Maestro. Pour un appel non consenti, vérifier au contraire que ces données ne sont pas envoyées.

## Éléments qui restent honnêtement non prouvés

Aucune preuve indépendante ne confirme encore que la release corrigée sonne, répond ou transporte un audio bidirectionnel sur des appareils physiques. L’APK Android debug a été compilé, mais aucun appareil n’était connecté. L’archive iOS, l’AAB signé, les soumissions Store et l’activation des deux fonctions Edge ne sont pas encore réalisés dans cette phase. La soumission doit attendre le résultat de la recette obligatoire, puis utiliser des numéros de version/build inédits dans les consoles.

## References

[1]: file:///tmp/planipret-native-no-ota-20260928/apps/planipret-mobile/ios/App/App/Plugins/PpPjsip/PpPjsip.swift "Bridge PJSIP iOS et permission microphone native"
[2]: file:///tmp/planipret-native-no-ota-20260928/supabase/functions/pp-ns-cdr/index.ts "Rapprochement CDR NetSapiens et déclenchement post-appel"
[3]: file:///tmp/planipret-native-no-ota-20260928/apps/planipret-mobile/src/lib/native/otaUpdater.ts "Politique de distribution native uniquement"
[4]: file:///tmp/planipret-native-no-ota-20260928/apps/planipret-mobile/src/pages/planipret/mobile/MCalls.tsx "Historique d’appels mobile"
