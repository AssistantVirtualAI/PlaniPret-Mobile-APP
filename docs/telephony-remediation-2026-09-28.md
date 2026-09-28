# Remédiation téléphonie mobile Planiprêt — 28 septembre 2026

**Auteur : Manus AI**

## Conclusion

Le lot de code corrige les défauts structurels identifiés dans le parcours iOS, le fournisseur WebRTC partagé et les fonctions Edge d’appel. Il est **validé par compilation web, tests unitaires et contrôles statiques**, mais il n’est **pas encore validé sur appareils réels**. Il ne doit donc pas être présenté comme une preuve que les appels entrants et sortants fonctionnent parfaitement en production.

La principale décision de sécurité sur Android est explicite. Le service Android qui tentait de recevoir un INVITE SIP en arrière-plan n’avait ni moteur SDP, ni WebRTC, ni RTP. Il ne peut donc plus enregistrer un second client SIP, répondre `180` ou afficher un faux parcours de réponse. Le client JsSIP de l’application active reste le seul propriétaire de l’AOR `<poste>W` sur WSS. La notification Android sert uniquement à réveiller ou ouvrir l’application. Un appel entrant Android lorsque l’application est complètement arrêtée nécessite une future pile média native complète ou une conception Android Telecom validée sur appareil ; ce lot ne prétend pas résoudre ce cas par une fausse réponse SIP.

Aucun appel réel, SMS réel, changement de DID, device NetSapiens, règle d’appel, file, secret, migration, déploiement Edge, OTA ou build de store n’a été lancé pendant cette remédiation. Les quatre tâches NetSapiens d’écriture restent suspendues.

## Correctifs appliqués

### iOS : CallKit, PJSIP et audio

Le bridge PJSIP accepte désormais uniquement TLS sur le port 5061 pour l’AOR mobile `<poste>M`. Les transports TCP et UDP ne sont plus des replis possibles. La sonde de registration utilise le même contrat TLS, ce qui évite une sonde qui réussirait sur un transport différent de celui de production.

Le flux sortant ne lance plus `pjsua_call_make_call` avant l’autorisation CallKit. L’application demande d’abord la transaction `CXStartCallAction`. Après `didActivate`, le moteur attache le périphérique audio PJSIP, vérifie le résultat, puis émet l’INVITE. Cela évite un appel SIP connecté avant que l’audio CallKit soit disponible.

Le bouton de réponse dans l’application ne peut plus appeler PJSIP directement. Il demande une transaction `CXAnswerCallAction`. Le délégué CallKit est le seul chemin qui demande le `200 OK` au moteur PJSIP. Un verrou par appel évite les réponses concurrentes entre PushKit, CallKit, JavaScript et l’arrivée tardive d’un INVITE.

La coupure micro utilise maintenant le niveau de transmission PJSIP (`tx`), et non le niveau de réception. Les connexions de conférence PJSIP sont vérifiées dans les deux directions. Lors de la désactivation CallKit ou de la fin d’appel, les connexions média sont détachées et PJSIP revient une seule fois sur le périphérique nul.

Le plugin iOS de keepalive ne modifie plus la catégorie, le mode ou l’activation `AVAudioSession` pendant un appel PJSIP/CallKit actif ou en attente. Cela retire la concurrence qui pouvait couper le son local ou distant. Le cycle CallKit suit le rôle prévu par Apple : l’application répond aux actions du fournisseur et utilise l’activation audio fournie par CallKit.[1]

### Android et WebRTC : un seul client SIP média

Le service Android généré est désormais un service **wake-only** `dataSync`. Il ne contient plus de socket WSS, de stockage de mot de passe SIP, de REGISTER, d’INVITE, de `180 Ringing`, de notification de réponse ni de réponse SIP. Il n’est pas démarré au boot. L’action de réenregistrement ne fait qu’émettre un signal au client JsSIP actif.

Cette décision élimine la fenêtre dans laquelle un service natif et JsSIP utilisaient le même AOR `<poste>W`. Elle empêche aussi le transfert impossible d’un dialogue SIP entre deux user agents. Le flux Android/Web doit obtenir un micro actif avant toute réponse. En cas de refus du micro, l’appel est refusé proprement au lieu de répondre sans média. Les pistes locales et les éléments audio sont libérés à la fin, à l’échec ou au raccrochage.

### Fonctions Edge et post-appel

Les événements CDR normalisent les directions d’appel avant écriture. Une valeur inconnue ne peut plus casser une colonne contrainte et ne remplace pas une direction déjà connue. Le lancement du traitement post-appel est conservé par `EdgeRuntime.waitUntil`, ce qui évite une requête non suivie qui serait abandonnée après l’accusé de réception du webhook.

Les pushes VoIP iOS et Android sont déclenchés avant le broadcast Realtime optionnel. Chaque canal est isolé : une erreur de base de données ou de Realtime ne doit plus empêcher le push urgent. Les échecs restent journalisés.

Les appels sortants enregistrés localement résolvent maintenant `planipret_profiles.id` avant l’insertion. Les erreurs de résolution ou d’insertion ne sont plus avalées. La réponse expose l’état de persistance locale afin que les diagnostics puissent distinguer un appel initié d’un historique local effectivement stocké.

Le chemin legacy REST de réponse d’appel est désactivé. Il ne peut pas répondre au dialogue SIP réel et risquait de créer un deuxième chemin de signalisation. La clôture locale vise les colonnes réellement présentes (`id`, `ns_call_id`, `ns_callid`).

La fonction d’annonce DID n’exécute plus d’auto-réparation à froid ni par en-tête. Le diagnostic est strictement en lecture seule. Toute écriture restante exige une confirmation textuelle explicite. L’outil de PUT arbitraire est désactivé tant que la configuration téléphonique est verrouillée.

## Vérifications effectuées

| Vérification | Résultat | Limite |
| --- | --- | --- |
| Tests Vitest complets mobile | 170/170 réussis | Tests navigateur simulé, pas de PJSIP réel. |
| Tests téléphonie ciblés | 23/23 réussis | Vérifient les invariants TypeScript et les gardes de route. |
| Bundle Vite avec `PP_SKIP_AUTOSYNC=1` | Réussi | Ne compile pas Swift ni Kotlin. |
| Vérification AOR, SIP bundle et contrôle critique mobile | Réussis | Les sources Android natives ne sont pas présentes dans ce checkout. |
| Vérification Android du générateur | Réussie | Le projet Capacitor Android doit encore être généré et compilé dans le dépôt de livraison. |
| Vérification Edge ajoutée | Réussie | Analyse les invariants, pas d’appel HTTP authentifié en production. |
| Analyse syntaxique TypeScript des quatre fonctions Edge modifiées | Réussie | Deno n’est pas installé dans ce sandbox. |
| Vérification Maestro | 20/20 opérations documentées | Vérification de contrat et de routes, pas de mutation réelle. |
| Vérification des outils AVA | 81/81 contrats, 25 sensibles protégés | Pas d’exécution d’outil sensible. |

Les avertissements observés dans les tests React concernent des stubs SVG et plusieurs instances simulées de GoTrue. Ils n’ont pas fait échouer les suites et ne portent pas sur le transport SIP ou l’audio.

## Conditions obligatoires avant publication

Une OTA ne peut pas embarquer Swift, Java, Kotlin, permissions, PJSIP, CallKit ou le service Android. Cette correction exige donc une nouvelle archive iOS et un nouvel AAB Android. Avant toute soumission, il faut générer les projets natifs à partir de ce commit, préserver l’équipe Xcode et les logos existants, compiler PJSIP avec TLS, puis contrôler les binaires produits.

La recette physique est un **blocage de release**. Sur un iPhone réel, elle doit vérifier la registration `<poste>M` TLS/5061, un entrant et un sortant, le micro, l’écouteur, le haut-parleur, le Bluetooth, la mise en sourdine, le verrouillage, l’arrière-plan, le push avant et après INVITE, deux appels successifs et les raccrochages locaux et distants. Les journaux doivent confirmer l’activation CallKit, l’ouverture du périphérique PJSIP, les deux liaisons média et le trafic RTP.

Sur Android réel, elle doit vérifier la registration unique `<poste>W` WSS, le micro, un sortant, un entrant lorsque l’application est active, le changement de réseau, le nettoyage média et l’absence de deuxième REGISTER. Le comportement d’un entrant lorsque l’application est complètement arrêtée doit être enregistré comme **non pris en charge par ce lot** jusqu’à l’implémentation et la recette d’un UAS média Android réel.

Enfin, une recette contrôlée doit confirmer le post-appel : historique local, CDR, consentement, enregistrement si le consentement est approuvé, et synchronisation Maestro uniquement après les garde-fous existants. Aucun test ne doit envoyer de SMS ou modifier un DID sans cible de test explicitement autorisée.

## État de release

Le lot est prêt pour une **intégration de code et une construction native de test**, mais pas pour une affirmation de fonctionnement à 100 % ni pour une soumission store. Le feu vert dépend des archives iOS/Android produites depuis ce commit et de la recette physique décrite ci-dessus.

## Références

[1]: https://developer.apple.com/documentation/callkit/cxproviderdelegate "CXProviderDelegate"
[2]: https://developer.apple.com/documentation/pushkit "PushKit"
[3]: https://developer.android.com/develop/background-work/services/fgs "Foreground services overview"
