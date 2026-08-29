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
  "android.permission.WAKE_LOCK",
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.USE_FULL_SCREEN_INTENT",
  "android.permission.FOREGROUND_SERVICE_PHONE_CALL",
  "android.permission.FOREGROUND_SERVICE_MICROPHONE",
  "android.permission.RECEIVE_BOOT_COMPLETED",
]) {
  check(applyCfg.includes(perm), `apply-native-config.mjs must declare ${perm}`);
}
check(
  applyCfg.includes('android:foregroundServiceType="phoneCall|microphone"'),
  "PpSipKeepAliveService must declare foregroundServiceType phoneCall|microphone (Android 14 mic in background)",
);
check(applyCfg.includes("PpSipKeepAliveService"), "Android SIP keep-alive service source is missing");
check(applyCfg.includes("PpIncomingActionReceiver"), "Android incoming-call action receiver is missing");
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
  if (fs.existsSync(manifestPath)) {
    const manifest = read(manifestPath);
    for (const perm of [
      "android.permission.RECORD_AUDIO",
      "android.permission.POST_NOTIFICATIONS",
      "android.permission.USE_FULL_SCREEN_INTENT",
      "android.permission.FOREGROUND_SERVICE_PHONE_CALL",
      "android.permission.FOREGROUND_SERVICE_MICROPHONE",
    ]) {
      check(manifest.includes(perm), `AndroidManifest.xml missing ${perm} — run node scripts/apply-native-config.mjs`);
    }
    check(manifest.includes("PpSipKeepAliveService"), "AndroidManifest.xml missing PpSipKeepAliveService");
    check(
      /android:foregroundServiceType="[^"]*phoneCall[^"]*\|[^"]*microphone|android:foregroundServiceType="[^"]*microphone[^"]*\|[^"]*phoneCall/.test(manifest),
      'PpSipKeepAliveService must declare foregroundServiceType="phoneCall|microphone" (Android 14 mic requirement) — run node scripts/apply-native-config.mjs',
    );
  } else {
    failures.push("android/app/src/main/AndroidManifest.xml not found");
  }
  const svc = path.join(androidDir, "app/src/main/java/com/planipret/mobile/PpSipKeepAliveService.java");
  if (fs.existsSync(svc)) {
    const java = read(svc);
    check(
      java.includes("FOREGROUND_SERVICE_TYPE_MICROPHONE"),
      "PpSipKeepAliveService.java startForeground() is missing FOREGROUND_SERVICE_TYPE_MICROPHONE — run node scripts/apply-native-config.mjs",
    );
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
