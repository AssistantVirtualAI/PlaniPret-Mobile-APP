# Moteur Android PJSIP M/TLS — Planiprêt

## Objectif

Ce dépôt contient le moteur SIP natif Android de Planiprêt. Les applications iOS et Android utilisent la ligne mobile `<poste>M` via SIP/TLS et PJSIP; le portail web demeure sur `<poste>W` via WSS. Il ne doit pas exister de repli silencieux Android vers W/WSS si l’enregistrement M/TLS échoue.

## Ce qui est versionné

- Le bridge Capacitor `PpPjsipPlugin`, le moteur `PpPjsipEngine` et le service d’appel Android.
- La persistance de session protégée par Android Keystore (AES-GCM à IV généré par le Keystore), ainsi que le test instrumenté de migration des blobs historiques.
- L’autorité publique ISRG Root X1, utilisée par PJSIP/OpenSSL pour vérifier le certificat TLS du serveur sans désactiver `verifyServer`.
- Le module `android/pjsua2/` : bindings Java PJSUA2 générés, règles R8/JNI et bibliothèques pour `arm64-v8a`, `armeabi-v7a`, `x86` et `x86_64`.
- Les scripts de contrôle qui refusent une build Android sans moteur, TLS strict, Keystore corrigé ou ABI 16 KB.

Les fichiers suivants ne doivent jamais être versionnés : `android/pjsua2/build/`, `.work/`, caches Gradle, AAB/APK, keystores, `keystore.properties`, mots de passe, jetons et secrets Firebase.

## Versions épinglées

| Élément | Version / source |
| --- | --- |
| PJSIP / PJSUA2 | `2.15.1`, tag Git `7de6e686fee1642f5443a3f39f0e5ad5e478a117` |
| OpenSSL | `openssl-3.5.9`, commit `45e844fa2a14ec92d146bd8f5778ac130b6625fb` |
| Android NDK | `27.2.12479018` |
| SWIG | `4.3.1`; SHA-256 `44fc829f70f1e17d635a2b4d69acab38896699ecc24aa023e516e0eabbec61b8` |
| ABI livrés | `arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64` |
| ELF 64 bits | segments PT_LOAD alignés à 16 KB |

## Reconstruction locale contrôlée

Prérequis macOS : Android SDK, NDK `27.2.12479018`, Java 21, `pcre2`, compilateur C/C++, Git, curl, make et environ 12 Go libres.

```bash
npm run android:build-openssl
bash scripts/ensure-swig-android.sh
npm run android:build-pjsip
npm run verify:android
npm run verify:android:pjsip
```

`ensure-swig-android.sh` télécharge la distribution historique officielle SWIG seulement si elle est absente, refuse toute archive dont le SHA-256 ne correspond pas, puis installe le binaire dans `.work/tools/`. Aucune clé ni configuration de téléphonie n’est utilisée par cette étape.

Pour créer une release après ces vérifications, utiliser le script de release Planiprêt approuvé. La compilation native et la signature restent des étapes distinctes : ce document ne publie rien dans Google Play, ne change aucun routage NetSapiens et n’envoie aucun REGISTER vers un compte courtier.

## Recette Karl 1142M après installation de la candidate

1. Ouvrir l’application 1.6.10, versionCode 58 ou ultérieur, puis se reconnecter afin d’éliminer les anciens blobs Keystore.
2. Ouvrir **SIP Debug** et appuyer sur **Re-register**.
3. Vérifier que le moteur affiche la ligne `1142M`, puis `registered` avec une dernière inscription renseignée.
4. Réaliser ensuite un appel entrant et sortant contrôlé, et vérifier réponse, son entrant/sortant et raccrochage.

Un statut `native_register_timeout` signifie que le moteur est présent mais n’a pas reçu de confirmation REGISTER dans le délai; il ne constitue pas une preuve d’échec PBX et ne doit jamais provoquer un retour vers `1142W`.
