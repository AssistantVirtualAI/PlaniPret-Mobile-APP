# SIP natif iOS — transport imposé : TLS 5061

Décidé le 2026-08-02. Cette décision est un prérequis, pas un détail d'implémentation.

## Règle

Tout code SIP **natif** (PJSIP ou autre) se connecte à
`core1.cluster1.ucstack.io:5061` en **TLS**. Jamais WSS 9002, jamais TCP 5060 en clair.

## Pourquoi

Aucune pile SIP native n'implémente SIP over WebSocket (RFC 7118) :

| SDK | UDP | TCP | TLS | WSS |
| --- | --- | --- | --- | --- |
| PJSIP / pjproject | oui | oui | oui | **non** |
| linphone-sdk / liblinphone | oui | oui | oui | **non** (hors roadmap, issue linphone-android#1970) |

- La macro `PJSIP_TRANSPORT_WSS` **n'existe pas**. Ne pas l'ajouter au build.
- Le module `PJ_WEBSOCK` de pjlib_util est un client HTTP expérimental destiné aux
  API d'IA temps réel ; il n'est pas enregistrable comme `pjsip_transport`.
- RFC 7118 côté serveur est fourni par Asterisk (`res_pjsip_transport_websocket.c`),
  pas par pjproject.

## Prérequis réseau : déjà satisfait (testé depuis l'internet public)

- `core1.cluster1.ucstack.io` → 64.26.133.72 ; TCP 5060 / 5061 / 9002 ouverts.
- TLS 5061 : TLSv1.3, `CN = core1.cluster1.ucstack.io`, `Verify return code: 0 (ok)`.
- `OPTIONS` SIP dans le tunnel TLS → `SIP/2.0 403 Forbidden` avec `received=`/`rport=`
  ajoutés : pile SIP NetSapiens complète et joignable. Résultat attendu pour une
  sonde anonyme.

Aucun ticket à ouvrir chez AVA Telecom.

## Répartition des transports

| Couche | Transport |
| --- | --- |
| JsSIP dans la WebView | WSS 9002 (inchangé) |
| PJSIP natif (sonde puis moteur) | TLS 5061 |

## Périmètre actuel

Jalon 1 seulement : `src/lib/native/PpPjsipProbe.ts` + `ios/App/App/Plugins/PpPjsip/`,
REGISTER manuel sur une AOR de test `<ext>PROBE`, déclenché depuis SIP Debug.
Aucun démarrage automatique, aucun branchement sur le chemin d'appel.
