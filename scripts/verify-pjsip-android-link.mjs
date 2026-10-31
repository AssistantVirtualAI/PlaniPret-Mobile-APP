#!/usr/bin/env node
/**
 * Refuse une build Android où le code annoncerait M/TLS sans les bindings
 * PJSUA2 et bibliothèques JNI réelles. Aucun appel réseau ni secret.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fail = (message) => { console.error(`Android PJSIP verification failed: ${message}`); process.exit(1); };
const requireFile = (relative) => {
  const full = path.join(root, relative);
  if (!fs.existsSync(full) || fs.statSync(full).size === 0) fail(`${relative} is absent or empty`);
  return fs.readFileSync(full, "utf8");
};

const engine = requireFile("android/app/src/main/java/com/planipret/mobile/PpPjsipEngine.java");
const plugin = requireFile("android/app/src/main/java/com/planipret/mobile/PpPjsipPlugin.java");
const service = requireFile("android/app/src/main/java/com/planipret/mobile/PpPjsipService.java");
for (const token of [
  "PJSIP_TRANSPORT_TLS", "setVerifyServer(true)", "normalizeMobileAor", "M\"",
  "onIncomingCall", "PJSIP_SC_OK", "onCallMediaState", "startTransmit",
  "setEcOptions", "PJSIP_ECHO_USE_NOISE_SUPPRESSOR", "handleIpChange",
  "setHangupCalls(false)", "setAudioRoute", "TYPE_BUILTIN_SPEAKER",
]) {
  if (!engine.includes(token)) fail(`PpPjsipEngine.java missing ${token}`);
}
for (const token of ["@CapacitorPlugin(name = \"PpPjsip\")", "isEngineLinked", "initialize", "makeCall", "hangupCall", "registrationState", "incomingCall", "callState", "setAudioRoute", "getAudioRoute", "notifyNetworkChange"]) {
  if (!plugin.includes(token)) fail(`PpPjsipPlugin.java missing ${token}`);
}
if (!service.includes("FOREGROUND_SERVICE_TYPE_PHONE_CALL")) fail("PpPjsipService.java must use phoneCall foreground service");

const buildScript = requireFile("scripts/build-pjsip-android.sh");
for (const token of ["PJMEDIA_HAS_SPEEX_AEC 1", "PJMEDIA_SPEEX_AEC_USE_DENOISE 1", "PJMEDIA_SPEEX_AEC_USE_AGC 1"]) {
  if (!buildScript.includes(token)) fail(`scripts/build-pjsip-android.sh missing ${token}`);
}

const module = path.join(root, "android/pjsua2");
requireFile("android/pjsua2/build.gradle");
const generatedRules = requireFile("android/pjsua2/consumer-rules.pro");
const appRules = requireFile("android/app/proguard-rules.pro");
const generatedBinding = requireFile("android/pjsua2/src/main/java/org/pjsip/pjsua2/pjsua2JNI.java");
for (const rules of [generatedRules, appRules]) {
  if (!rules.includes("-keep class org.pjsip.pjsua2.** { *; }")) {
    fail("PJSUA2 JNI callbacks are not protected from R8 shrinking");
  }
}
for (const callback of ["SwigDirector_AudioMediaPort_onFrameRequested", "SwigDirector_AudioMediaPort_onFrameReceived"]) {
  if (!generatedBinding.includes(callback)) fail(`generated PJSUA2 binding missing ${callback}`);
}
const nativeLibraries = ["libpjsua2.so", "libssl.so", "libcrypto.so", "libc++_shared.so"];
for (const abi of ["arm64-v8a", "armeabi-v7a", "x86", "x86_64"]) {
  for (const library of nativeLibraries) {
    const full = path.join(module, "src/main/jniLibs", abi, library);
    if (!fs.existsSync(full) || fs.statSync(full).size === 0) fail(`missing JNI ${abi}/${library}; run scripts/build-pjsip-android.sh`);
  }
}

// Google Play requires 16 KB ELF alignment for 64-bit libraries. The candidate
// uses NDK r27, so this rejects a stale OpenSSL/PJSIP output linked at 4 KB.
const sdkRoot = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME || path.join(os.homedir(), "Library", "Android", "sdk");
const ndkRoot = process.env.ANDROID_NDK_ROOT || path.join(sdkRoot, "ndk", "27.2.12479018");
const readelf = path.join(ndkRoot, "toolchains", "llvm", "prebuilt", "darwin-x86_64", "bin", "llvm-readelf");
if (!fs.existsSync(readelf)) fail(`llvm-readelf absent: ${readelf}`);
for (const abi of ["arm64-v8a", "x86_64"]) {
  for (const library of nativeLibraries) {
    const full = path.join(module, "src/main/jniLibs", abi, library);
    const output = execFileSync(readelf, ["-lW", full], { encoding: "utf8" });
    const alignments = output.split("\n")
      .filter((line) => /^\s*LOAD\s/.test(line))
      .map((line) => line.trim().split(/\s+/).at(-1))
      .map((value) => Number.parseInt(value, 16));
    if (!alignments.length || alignments.some((alignment) => !Number.isFinite(alignment) || alignment < 0x4000)) {
      fail(`${abi}/${library} is not 16 KB ELF aligned; rebuild OpenSSL/PJSIP with the NDK r27 16 KB linker flags`);
    }
  }
}
const generatedJava = path.join(module, "src/main/java/org/pjsip/pjsua2/Endpoint.java");
if (!fs.existsSync(generatedJava)) fail("generated PJSUA2 Java bindings missing; run scripts/build-pjsip-android.sh");
console.log("Android PJSIP verification passed: TLS engine, generated Java and JNI libraries are present.");
