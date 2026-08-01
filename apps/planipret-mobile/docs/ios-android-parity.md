# Planiprêt Mobile — iOS / Android parity audit

Source of truth for what runs where. Run `npm run verify:android` (Android)
and `npm run ios:verify` (iOS) before every device build; both are wired into
`build:ios` / `build:android`.

## Feature matrix

| Feature | iOS | Android | Notes |
| --- | --- | --- | --- |
| SIP over WSS (JsSIP, foreground) | Yes | Yes | shared `ppSipProvider.ts` |
| Native keep-alive (background REGISTER) | `PpSipKeepAlive` (Swift) | `PpSipKeepAliveService` (foreground service) | injected by `scripts/apply-native-config.mjs` |
| Wake while app killed | PushKit VoIP + CallKit | FCM high-priority **data** message → `wakePlanipretNativeSipForIncomingCall("fcm_push")` → full-screen notification | Android needs `google-services.json` |
| Incoming call UI | CallKit native screen | Full-screen intent notification + in-app `InboundCallOverlay` | Answer/Decline actions on both |
| Mic in background during a call | AVAudioSession + `callActive` | foreground service type `phoneCall\|microphone` (Android 14 requirement) | |
| Push token storage | `pp-voip-push-token` (PushKit hex token) | `mobile-register-push` (FCM token) — `pp-voip-push-token` also accepts `android` | tables: `planipret_voip_push_tokens`, `mobile_push_tokens` |
| Deep links (Maestro / Microsoft OAuth) | Universal Links + `planipret://` | App Links (`assetlinks.json`) + `planipret://` | |
| Contacts, camera, filesystem, haptics | Capacitor plugins | Capacitor plugins | identical JS |
| Maestro call posting rules 1–4 | Shared JS | Shared JS | platform-independent |
| AVA chat / voice, Maestro endpoints | Shared JS + Edge Functions | Shared JS + Edge Functions | platform-independent |

## Backend

- `ns-webhook-receiver` now sends **both**: APNs VoIP to iOS tokens and an FCM
  data message to Android tokens (`sendAndroidCallPush`). Missing config on
  either side only logs a warning; the other platform keeps working.
- FCM credentials: service-account JSON in the `FCM_SERVICE_ACCOUNT_JSON`
  secret, or `planipret_integration_secrets` (provider `mobile_app`, key
  `fcm_service_account_json`).

## Android device checklist

1. `npm run cap:add:android` (first time) then `npm run android:build-sync`.
2. Drop `google-services.json` into `android/app/` (same Firebase project as
   the service account above) — without it, calls only ring when the app is
   running.
3. Grant: microphone, notifications, and disable battery optimisation
   (in-app prompt calls `requestBatteryOptimizationExemption`).
4. Test: app foreground / background / swiped away → incoming call must ring
   with a full-screen notification and Answer must connect audio both ways.

## Pre-release checklist

### iOS
- [ ] Incoming call, app killed (PushKit + CallKit)
- [ ] Incoming call, app backgrounded
- [ ] Outgoing call
- [ ] Mic stays live when backgrounding an active call
- [ ] Call recording notice plays once

### Android
- [ ] Real `google-services.json` in `android/app/` (never the placeholder — `npm run verify:android` now fails on it)
- [ ] `FCM_SERVICE_ACCOUNT_JSON` set in Edge Function secrets
- [ ] Incoming call, app killed (FCM data message)
- [ ] Incoming call, app backgrounded
- [ ] Outgoing call
- [ ] Mic stays live on Android 14+ (`phoneCall|microphone` foreground service type)
- [ ] Call recording notice plays once

## Firebase setup (Android)

1. Create/open the Firebase project at console.firebase.google.com.
2. Add the Android app with package `com.planipret.mobile`.
3. Download `google-services.json` → `android/app/`.
4. IAM → Service Accounts → Firebase Admin SDK → generate a JSON key.
5. Store that JSON as the `FCM_SERVICE_ACCOUNT_JSON` backend secret.
