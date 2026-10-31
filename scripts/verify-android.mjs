#!/usr/bin/env node
/** Planiprêt Android source verification: native PJSIP M/TLS, never mobile WSS. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(appDir, relative), "utf8");
const failures = [];
const notes = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); };

const generator = read("scripts/apply-native-config.mjs");
for (const token of [
  "PpPjsipPlugin.java", "PpPjsipEngine.java", "PpPjsipService.java",
  "android.permission.FOREGROUND_SERVICE_PHONE_CALL",
  "android.permission.FOREGROUND_SERVICE_MICROPHONE",
  "android.permission.MANAGE_OWN_CALLS",
  'android:foregroundServiceType="phoneCall|microphone"',
]) check(generator.includes(token), `apply-native-config.mjs missing ${token}`);
check(generator.includes("PpPjsipEngine.wakeForIncoming"), "FCM must wake PJSIP M/TLS, not JsSIP/WSS");
check(!generator.includes('requestReregister(c, "incoming_" + userAction)'), "notification actions must not ask JsSIP to answer an active PJSIP dialog");

const capCfg = read("capacitor.config.ts");
check(/CapacitorHttp:\s*{\s*enabled:\s*false/s.test(capCfg), "CapacitorHttp must remain disabled");
check(capCfg.includes("androidScheme: 'https'") || capCfg.includes('androidScheme: "https"'), "androidScheme must be https");

const packageJson = JSON.parse(read("package.json"));
check(
  !Object.hasOwn(packageJson.dependencies || {}, "capacitor-pjsip"),
  "obsolete file:./capacitor-pjsip dependency must not replace the native PpPjsip plugin",
);

const route = read("src/lib/planipret/sip/outboundRoute.ts");
check(route.includes('input.platform === "ios" || input.platform === "android"'), "both native platforms must select M/TLS");
check(route.includes("return false;") && !route.includes('return "webview"'), "mobile route must prohibit WSS fallback");
const nativeSip = read("src/lib/planipret/sip/nativeSipService.ts");
check(nativeSip.includes('Capacitor.getPlatform() !== "android"') && nativeSip.includes("pjsip.answerCall"), "Android must answer through native PJSIP");

const androidRoot = path.join(appDir, "android/app/src/main");
if (fs.existsSync(androidRoot)) {
  const manifest = read("android/app/src/main/AndroidManifest.xml");
  for (const token of ["PpPjsipService", "phoneCall|microphone", "FOREGROUND_SERVICE_PHONE_CALL", "FOREGROUND_SERVICE_MICROPHONE", "MANAGE_OWN_CALLS"]) {
    check(manifest.includes(token), `AndroidManifest.xml missing ${token}`);
  }
  check(manifest.includes('android:name=".MainActivity"'), "AndroidManifest.xml must declare the Planiprêt launcher MainActivity");
  const mainActivity = read("android/app/src/main/java/com/planipret/mobile/MainActivity.java");
  check(mainActivity.startsWith("package com.planipret.mobile;"), "MainActivity must use the Planiprêt application package");
  check(mainActivity.includes("class MainActivity extends BridgeActivity"), "MainActivity must remain a Capacitor BridgeActivity");
  const engine = read("android/app/src/main/java/com/planipret/mobile/PpPjsipEngine.java");
  for (const token of ["PJSIP_TRANSPORT_TLS", "setVerifyServer(true)", "normalizeMobileAor", "onIncomingCall", "PJSIP_SC_OK", "startTransmit", "AndroidKeyStore", "AES/GCM/NoPadding", "wakeForIncoming"]) {
    check(engine.includes(token), `PpPjsipEngine.java missing ${token}`);
  }
  const tlsCa = path.join(appDir, "android/app/src/main/res/raw/isrg_root_x1.pem");
  const tlsCaTemplate = path.join(appDir, "scripts/templates/android/isrg_root_x1.pem");
  check(fs.existsSync(tlsCa), "Android PJSIP trust-anchor resource is missing");
  check(fs.existsSync(tlsCaTemplate), "Android PJSIP trust-anchor template is missing");
  if (fs.existsSync(tlsCa)) {
    const pem = fs.readFileSync(tlsCa, "utf8");
    check(pem.includes("BEGIN CERTIFICATE") && pem.includes("ISRG Root X1") === false, "Android TLS CA must remain PEM-only public material");
  }
  check(engine.includes("setCaBuf(planipretTlsCa(appContext))"), "PJSIP TLS must receive the bundled public CA");
  check(engine.includes("class PlanipretEndpoint extends Endpoint"), "PJSIP must retain a TLS transport callback for safe diagnostics");
  check(engine.includes("getVerifyStatus()"), "PJSIP TLS verification status must remain observable without raw transport details");
  check(engine.includes("cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey(keyAlias));"), "Android Keystore must generate the AES-GCM IV");
  check(engine.includes("byte[] iv = cipher.getIV();"), "Android Keystore IV must be persisted after encryption");
  check(!engine.includes("new SecureRandom().nextBytes(iv)"), "caller-provided IV is forbidden for Android Keystore AES-GCM");
  check(!engine.includes("Cipher.ENCRYPT_MODE, getOrCreateKey(), new GCMParameterSpec"), "legacy caller-IV encryption must be absent");
  check(engine.includes('if (envelope.optInt("v", 0) != 2)'), "legacy encrypted sessions must be invalidated safely");
  check(engine.includes("prefs.edit().remove(blobName).apply()"), "unreadable secure sessions must be cleared without crashing");
  check(engine.includes("persistSessionForWakeBestEffort"), "Keystore persistence must not block the foreground M/TLS REGISTER");
  check(engine.includes("foreground M/TLS registration continues"), "Keystore persistence failure must be non-blocking for the active M/TLS account");
  check(engine.includes("verifyLegacySessionIsDiscardedForInstrumentation"), "legacy Keystore-session discard test helper missing");
  check(engine.includes("edit().remove(SECURE_BLOB).apply()"), "clearing a secure wake session must not erase unrelated preferences");
  check(fs.existsSync(path.join(appDir, "android/app/src/androidTest/java/com/planipret/mobile/PpPjsipSecureSessionInstrumentedTest.java")), "Android Keystore instrumentation round-trip test missing");
  const fcm = read("android/app/src/main/java/com/planipret/mobile/PpFirebaseMessagingService.java");
  check(fcm.includes("PpPjsipEngine.wakeForIncoming"), "FCM must wake native PJSIP engine");
  const receiver = read("android/app/src/main/java/com/planipret/mobile/PpIncomingActionReceiver.java");
  check(receiver.includes("PpPjsipPlugin.answerFromNotification"), "Answer action must target the actual PJSIP dialog");
  check(receiver.includes("PpPjsipPlugin.declineFromNotification"), "Decline action must target the actual PJSIP dialog");
  const plugin = read("android/app/src/main/java/com/planipret/mobile/PpPjsipPlugin.java");
  check(!plugin.includes("new JSObject(PpPjsipEngine.state())"), "PJSIP state Map must not be passed to JSObject(String)");
  check(plugin.includes("PpPjsipEngine.state().entrySet()"), "PJSIP state must be copied explicitly to a Capacitor JSObject");
  const callService = read("android/app/src/main/java/com/planipret/mobile/PpPjsipService.java");
  check(callService.includes("ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)"), "PJSIP service must check RECORD_AUDIO before declaring microphone FGS type");
  check(callService.includes("hasMicrophonePermission()"), "PJSIP service must defer microphone FGS type until permission is granted");
  check(callService.includes("catch (SecurityException | IllegalStateException error)"), "PJSIP service must contain FGS policy failures instead of crashing the app");
  check(callService.includes("static boolean prepareForCall(Context context)"), "PJSIP service must expose the post-permission call promotion gate");
  check(engine.includes("ensureMicrophoneServiceForCallLocked();"), "PJSIP must promote microphone FGS only for makeCall/answer");
  check(engine.includes("PpPjsipService.prepareForCall(appContext)"), "PJSIP calls must require the protected microphone service");
  // The historical dataSync wake-only service may display a low-priority wake
  // notification, but it must never become a second SIP/media user agent.
  const wakeOnly = read("android/app/src/main/java/com/planipret/mobile/PpSipKeepAliveService.java");
  check(wakeOnly.includes("Android wake-only bridge"), "wake-only service must remain explicitly documented");
  check(wakeOnly.includes("wake_only_no_media_engine"), "wake-only service must report no media engine");
  check(!/pjsua_|PJSIP_TRANSPORT_|startTransmit\(/.test(wakeOnly), "wake-only service must not contain PJSIP, RTP or media operations");
} else {
  notes.push("Android native project absent; run npx cap add android then node scripts/apply-native-config.mjs.");
}

const module = path.join(appDir, "android/pjsua2");
if (!fs.existsSync(path.join(module, "build.gradle"))) {
  notes.push("JNI PJSIP artifacts absent: scripts/build-pjsip-android.sh must run before Gradle build or release.");
}
if (notes.length) console.log(`Android verification notes:\n${notes.map((x) => `- ${x}`).join("\n")}`);
if (failures.length) {
  console.error(`Android verification failed:\n${failures.map((x) => `- ${x}`).join("\n")}`);
  process.exit(1);
}
console.log("Android source verification passed: M/TLS native PJSIP contract is present.");
