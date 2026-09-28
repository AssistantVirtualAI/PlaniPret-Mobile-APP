#!/usr/bin/env node
/**
 * Planiprêt mobile — Android parity verification.
 *
 * Static checks always run (native config source of truth). Manifest checks
 * run only when `android/` exists locally (after `npx cap add android`), so
 * CI without a native project still validates the generator.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(p, "utf8");
const failures = [];
const notes = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };

// ---- 1. Native config generator ----
const applyCfg = read(path.join(appDir, "scripts/apply-native-config.mjs"));
for (const perm of [
  "android.permission.RECORD_AUDIO",
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.USE_FULL_SCREEN_INTENT",
  "android.permission.FOREGROUND_SERVICE_DATA_SYNC",
]) {
  check(applyCfg.includes(perm), `apply-native-config.mjs must declare ${perm}`);
}
check(
  applyCfg.includes('android:foregroundServiceType="dataSync"'),
  "PpSipKeepAliveService must be a dataSync wake-only service, never a background media call service",
);
check(applyCfg.includes("PpSipKeepAliveService"), "Android SIP keep-alive service source is missing");
check(applyCfg.includes("PpFirebaseMessagingService"), "Android FCM wake-up service is missing");
check(applyCfg.includes("wake_only_no_media_engine"), "Android service must state that it cannot consume SIP media dialogs");
check(applyCfg.includes("ACTION_REREGISTER.equals(action)"), "ACTION_REREGISTER must be handled by the wake-only service");
check(applyCfg.includes('android:scheme="planipret"'), "Android deep-link scheme planipret:// is missing");

// ---- 2. Capacitor config ----
const capCfg = read(path.join(appDir, "capacitor.config.ts"));
check(/CapacitorHttp:\s*{\s*enabled:\s*false/s.test(capCfg), "CapacitorHttp must stay disabled (breaks Supabase auth headers)");
check(capCfg.includes("androidScheme: 'https'") || capCfg.includes('androidScheme: "https"'), "androidScheme must be https");
check(capCfg.includes("PushNotifications"), "PushNotifications config missing (needed for FCM wake-up)");

// ---- 3. JS platform parity ----
const nativeSip = read(path.join(appDir, "src/lib/planipret/sip/nativePpSipService.ts"));
check(
  nativeSip.includes("export function isPlanipretNativeSipAvailable")
    && /isPlanipretNativeSipAvailable\(\): boolean \{ return isNative\(\)/.test(nativeSip),
  "isPlanipretNativeSipAvailable must be capability-based (isNative), not iOS-only",
);
const notif = read(path.join(appDir, "src/lib/native/permissions/notifications.ts"));
check(notif.includes("wakePlanipretNativeSipForIncomingCall"), "Android FCM data push must wake the native SIP service");
check(notif.includes("mobile-register-push"), "Push token registration must post to mobile-register-push");

// ---- 4. Local native project (optional) ----
const androidDir = path.join(appDir, "android");
const androidGenerated = fs.existsSync(path.join(androidDir, "app/src/main"));
if (androidGenerated) {
  const manifestPath = path.join(androidDir, "app/src/main/AndroidManifest.xml");
  const appGradlePath = path.join(androidDir, "app/build.gradle");
  if (fs.existsSync(appGradlePath)) {
    check(read(appGradlePath).includes("com.google.firebase:firebase-messaging"), "App module must expose Firebase Messaging to PpFirebaseMessagingService");
  }
  if (fs.existsSync(manifestPath)) {
    const manifest = read(manifestPath);
    for (const perm of [
      "android.permission.RECORD_AUDIO",
      "android.permission.POST_NOTIFICATIONS",
      "android.permission.USE_FULL_SCREEN_INTENT",
      "android.permission.FOREGROUND_SERVICE_DATA_SYNC",
    ]) {
      check(manifest.includes(perm), `AndroidManifest.xml missing ${perm} — run node scripts/apply-native-config.mjs`);
    }
    check(manifest.includes("PpSipKeepAliveService"), "AndroidManifest.xml missing PpSipKeepAliveService");
    check(manifest.includes("PpFirebaseMessagingService"), "AndroidManifest.xml missing PpFirebaseMessagingService");
    check(manifest.includes('com.capacitorjs.plugins.pushnotifications.MessagingService') && manifest.includes('tools:node="remove"'), "Capacitor MessagingService must be replaced so only one FCM service consumes each push");
    check(!manifest.includes('foregroundServiceType="phoneCall|microphone"'), "AndroidManifest.xml must not retain the obsolete media SIP foreground service");
    check(!manifest.includes("PpBootReceiver") && !manifest.includes("android.permission.RECEIVE_BOOT_COMPLETED"), "AndroidManifest.xml must not retain boot-time SIP registration");
    check(!manifest.includes("android.permission.FOREGROUND_SERVICE_PHONE_CALL") && !manifest.includes("android.permission.FOREGROUND_SERVICE_MICROPHONE"), "AndroidManifest.xml must not request media foreground-service permissions for wake-only SIP");
    check(!manifest.includes("android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS"), "Do not request blanket battery-optimization exemption");
    check(!manifest.includes("android.permission.SCHEDULE_EXACT_ALARM"), "Do not request exact-alarm permission without an alarm feature");
    check(manifest.includes('android:foregroundServiceType="dataSync"'), 'PpSipKeepAliveService must declare foregroundServiceType="dataSync" — run node scripts/apply-native-config.mjs');
  } else {
    failures.push("android/app/src/main/AndroidManifest.xml not found");
  }
  const svc = path.join(androidDir, "app/src/main/java/com/planipret/mobile/PpSipKeepAliveService.java");
  if (fs.existsSync(svc)) {
    const java = read(svc);
    check(java.includes("FOREGROUND_SERVICE_TYPE_DATA_SYNC"), "PpSipKeepAliveService.java must start only as a dataSync wake service — run node scripts/apply-native-config.mjs");
    check(java.includes("wake_only_no_media_engine"), "PpSipKeepAliveService.java must not claim to run a media-capable SIP UAS");
    check(java.includes("ACTION_REREGISTER.equals(action)"), "PpSipKeepAliveService.java must handle ACTION_REREGISTER");
  }
  const boot = path.join(androidDir, "app/src/main/java/com/planipret/mobile/PpBootReceiver.java");
  if (fs.existsSync(boot)) {
    const java = read(boot);
    check(java.includes("Aucun REGISTER de fond au démarrage") && !java.includes("PpSipKeepAliveService.start(context)"), "Boot receiver must never start a competing SIP registration");
  }
  const gs = path.join(androidDir, "app/google-services.json");
  if (!fs.existsSync(gs)) {
    notes.push("android/app/google-services.json is absent — FCM wake-up (incoming calls while the app is killed) will not work until it is added.");
  } else {
    const raw = read(gs);
    if (/placeholder/i.test(raw) || /PLACEHOLDER_/.test(raw)) {
      failures.push("android/app/google-services.json is still the Firebase placeholder — download the real file from the Firebase console before a device build.");
    }
  }
} else {
  notes.push("Native Android project not generated (android/app/src absent) — run `npm run cap:add:android` then `npm run android:build-sync` before a device build.");
  const gs = path.join(androidDir, "app/google-services.json");
  if (!fs.existsSync(gs)) {
    notes.push("android/app/google-services.json is absent — FCM wake-up will not work until it is added.");
  }
}

if (notes.length) {
  console.log("Android verification notes:");
  for (const note of notes) console.log(`- ${note}`);
}
if (failures.length) {
  console.error("Android verification failed:");
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log("Android verification passed.");
