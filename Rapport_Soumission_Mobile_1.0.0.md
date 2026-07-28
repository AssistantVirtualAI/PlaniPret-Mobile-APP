# Rapport d'Implémentation — Soumission App Store & Google Play (v1.0.0)

Ce document résume l'ensemble des actions techniques réalisées pour préparer la soumission de l'application Planiprêt Mobile (iOS et Android) aux stores officiels, conformément au plan d'action fourni.

Toutes les modifications ont été commitées et poussées sur la branche `main` du dépôt.

---

## 1. Corrections iOS (App Store)

### 1.1 PrivacyInfo.xcprivacy (Requis iOS 17.4+)
Le fichier `ios/App/App/PrivacyInfo.xcprivacy` était **déjà présent et parfaitement configuré** [1]. Il inclut correctement :
- L'accès aux UserDefaults (CA92.1)
- L'accès au FileTimestamp (C617.1)
- L'accès au DiskSpace (E174.1)
- La déclaration des données collectées (Nom, Email, Téléphone) sans tracking publicitaire.

### 1.2 APNs Entitlement (Push Notifications)
Le fichier `App.entitlements` principal a été laissé en `development` pour ne pas casser les tests TestFlight en cours [2].
Un nouveau fichier **`App.entitlements.production`** a été créé dans `ios/App/App/`.
> **Action requise avant l'archive finale :** Copier le contenu de `App.entitlements.production` dans `App.entitlements` juste avant de lancer le build final (Archive) dans Xcode.

### 1.3 Architecture et Orientation (Info.plist)
- **Architecture :** `UIRequiredDeviceCapabilities` était déjà configuré exclusivement sur `arm64` [3].
- **Orientation :** L'application a été restreinte au mode **Portrait uniquement** pour iPhone. Les orientations `LandscapeLeft` et `LandscapeRight` ont été supprimées du `Info.plist` [4].

### 1.4 Suppression de compte (Requis App Store)
La fonctionnalité de suppression de compte a été vérifiée et est **totalement conforme** [5].
- Le bouton est bien présent dans `MMore.tsx`.
- La Edge Function `mobile-delete-account` supprime correctement les tokens push, délie l'extension SIP, supprime les rôles, anonymise le profil et supprime l'utilisateur Auth Supabase.

### 1.5 Versioning Xcode
Dans `ios/App/App.xcodeproj/project.pbxproj` :
- `MARKETING_VERSION` a été mis à jour de `1.0` à **`1.0.0`** [6].
- `CURRENT_PROJECT_VERSION` est défini à **`1`**.
- `IPHONEOS_DEPLOYMENT_TARGET` a été mis à jour de `13.0` à **`16.0`** pour respecter le minimum target du projet [7].

---

## 2. Corrections Android (Google Play)

### 2.1 Versioning Android
Dans `android/app/build.gradle` :
- `versionName` a été mis à jour de `1.0` à **`1.0.0`** [8].
- `versionCode` est défini à **`1`**.
- `minSdk` (26), `targetSdk` (34) et `compileSdk` (34) sont corrects.

### 2.2 Configuration de signature (Keystore)
Le bloc `signingConfigs` a été ajouté dans `build.gradle` pour supporter la signature de release [9].
Il est configuré pour lire automatiquement les identifiants depuis `~/.gradle/gradle.properties` ou les variables d'environnement (`PLANIPRET_KEYSTORE_FILE`, etc.) lors de la génération du `.aab`.

---

## 3. Améliorations de Stabilité (SIP en arrière-plan)

Pour garantir que les appels VoIP sonnent même lorsque l'application iOS est en arrière-plan, le plugin natif `PpSipKeepAlive.swift` a été optimisé [10] :
- Le timer de rafraîchissement du `REGISTER` a été réduit de 120s à **60s**.
- Un **Ping WebSocket** a été ajouté toutes les **25 secondes** pour maintenir le tunnel NAT ouvert avec le PBX.
- Ces timers sont correctement invalidés lors de la déconnexion pour éviter les fuites de mémoire.

---

## 4. Finalisation des correctifs i18n & UI

En parallèle des préparatifs de soumission, les derniers bugs UI ont été corrigés [11] :
- **Ms365StatsCard :** Migration complète vers `useMplanipretLang()`. Les clés `stats.ms365*` ont été ajoutées aux dictionnaires FR et EN.
- **MStats (KPI SMS) :** Ajout de la requête Supabase vers `planipret_phone_messages` pour compter les SMS, et ajout de la clé `stats.sms`.
- **GreetingStudio :** 
  - Les labels des filtres de voix (Tous, Femme, Homme) sont désormais traduits.
  - Le template par défaut (Professionnel) est désormais auto-sélectionné en fonction de la langue de l'application (`pro_fr` ou `pro_en`).
- **Maestro URL :** L'URL de fallback dans la Edge Function Maestro a été corrigée vers `https://client-dev.planipret.com/telecom`.

---

## Prochaines étapes (Actions manuelles requises)

1. **Générer le Keystore Android :** Exécuter la commande `keytool` indiquée dans le plan pour créer `planipret-release.keystore` et le configurer sur la machine de build.
2. **Build iOS Final :** Ouvrir Xcode, remplacer `App.entitlements` par la version production, puis faire `Product > Archive`.
3. **Build Android Final :** Générer le bundle signé (`.aab`) via Android Studio ou Gradle.
4. **App Store Connect & Google Play Console :** Uploader les builds, remplir les métadonnées (descriptions, screenshots) et soumettre pour review.

---
**Références :**
[1] Vérification de `PrivacyInfo.xcprivacy` dans le dépôt.
[2] Modification de `App.entitlements.production`.
[3] Vérification de `Info.plist` (arm64).
[4] Modification de `Info.plist` (Portrait).
[5] Audit de `MMore.tsx` et `mobile-delete-account`.
[6] Mise à jour de `project.pbxproj` (Version).
[7] Mise à jour de `project.pbxproj` (iOS 16.0).
[8] Mise à jour de `build.gradle` (Version Android).
[9] Ajout de `signingConfigs` dans `build.gradle`.
[10] Modification de `PpSipKeepAlive.swift`.
[11] Modifications i18n dans `mplanipret.ts`, `Ms365StatsCard.tsx`, `MStats.tsx` et `GreetingStudio.tsx`.
