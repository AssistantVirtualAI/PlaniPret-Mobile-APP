# Planiprêt Mobile — Guide de configuration native

## Identifiants de l'application

| Paramètre | Valeur |
|---|---|
| **App ID (iOS/Android)** | `com.planipret.mobile` |
| **Nom d'affichage** | `Planiprêt` |
| **Schéma deep link** | `planipret://` |
| **Port de développement** | `5175` |
| **App Lemtel (distinct)** | `com.lemtel.softphone` |

---

## Initialisation du projet natif (première fois)

```bash
cd apps/planipret-mobile

# Installer les dépendances
npm install

# Vérifier que l'app native est autonome et alignée sur /mplanipret
npm run audit:native

# Ajouter les plateformes natives
npx cap add ios
npx cap add android

# Synchroniser le build web
npm run build
npx cap sync
```

---

## Configuration iOS (Xcode)

### 1. Bundle Identifier
Dans Xcode → `App` target → **Signing & Capabilities** :
- Bundle Identifier : `com.planipret.mobile`
- Team : votre Apple Developer Team Planiprêt

### 2. Certificats APNs (Push Notifications)
Les certificats APNs de Planiprêt sont **distincts** de ceux de Lemtel :
- Créer un App ID `com.planipret.mobile` dans [Apple Developer Portal](https://developer.apple.com)
- Activer **Push Notifications** et **VoIP**
- Générer un certificat APNs Production pour Planiprêt
- Uploader dans Supabase Dashboard → Project Settings → Edge Functions → Secrets :
  - `PLANIPRET_APNS_KEY_ID`
  - `PLANIPRET_APNS_TEAM_ID`
  - `PLANIPRET_APNS_PRIVATE_KEY`

### 3. Capabilities requises
- Push Notifications
- Background Modes : Audio, VoIP, Remote notifications
- App Groups (optionnel, pour partage de données avec extension)

---

## Configuration Android (Android Studio)

### 1. Application ID
Dans `android/app/build.gradle` :
```gradle
android {
    defaultConfig {
        applicationId "com.planipret.mobile"
        versionCode 1
        versionName "1.0.0"
    }
}
```

### 2. Firebase Cloud Messaging (FCM)
- Créer un projet Firebase `planipret-mobile` (distinct du projet Lemtel)
- Télécharger `google-services.json` et placer dans `android/app/`
- Uploader la clé FCM dans Supabase → Secrets : `PLANIPRET_FCM_SERVER_KEY`

### 3. Icônes et ressources
- Icône principale : `assets/planipret-icon.png` (1024×1024)
- Couleur de thème : `#1A4A8A` (bleu Planiprêt)
- Splash screen : fond `#0A1425` (bleu nuit)

---

## Variables d'environnement Supabase requises

Ces secrets doivent être configurés dans le panneau admin Planiprêt
(`/planipret/admin/integrations`) :

| Secret | Description |
|---|---|
| `NS_API_BASE_URL` | URL du serveur NetSapiens (ex: `https://pbx.planipret.com`) |
| `NS_API_USER` | Utilisateur admin NS-API |
| `NS_API_PASSWORD` | Mot de passe NS-API |
| `NS_DEFAULT_DOMAIN` | Domaine NS-API par défaut (ex: `planipret.com`) |
| `NS_API_CLIENT_ID` | Client ID OAuth2 NS-API (optionnel) |
| `NS_API_CLIENT_SECRET` | Client Secret OAuth2 NS-API (optionnel) |

---

## Séparation Lemtel / Planiprêt

La séparation entre les deux applications est garantie à plusieurs niveaux :

| Niveau | Mécanisme |
|---|---|
| **Routage web** | `AppSeparationGuard` + `MplanipretGuard` |
| **Edge Functions** | `requirePlanipretBroker()` vérifie `is_planipret_member()` |
| **Base de données** | RLS sur `planipret_profiles` par `organization_id` |
| **Natif iOS** | Bundle ID distinct : `com.planipret.mobile` vs `com.lemtel.softphone` |
| **Natif Android** | Application ID distinct |
| **APNs/FCM** | Certificats push distincts par app |

---

## Build et déploiement

```bash
# Build debug (ouvre Xcode)
./scripts/ios-build.sh debug

# Build release (archive pour App Store)
./scripts/ios-build.sh release

# Build Android
npm run build:android
```

Important : ne lancez jamais `npm run build` depuis la racine pour générer l'app native Planiprêt. Utilisez toujours :

```bash
cd apps/planipret-mobile
npm run build
npx cap sync ios     # ou android
```
