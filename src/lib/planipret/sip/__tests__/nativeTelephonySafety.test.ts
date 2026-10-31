import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * These are intentionally source-level regression tests. PJSIP, CallKit and
 * Android foreground-service behavior cannot be truthfully exercised in jsdom;
 * this suite prevents the known unsafe topologies from returning unnoticed.
 */
const cwd = process.cwd();
const mobileRoot = existsSync(resolve(cwd, "ios/App/App"))
  ? cwd
  : resolve(cwd, "apps/planipret-mobile");
const read = (relative: string) => readFileSync(resolve(mobileRoot, relative), "utf8");

describe("native telephony safety invariants", () => {
  it("keeps the iOS mobile AOR on TLS 5061 with no TCP transport", () => {
    const bridge = read("ios/App/App/Plugins/PpPjsip/PpPjsip.swift");
    const engine = read("ios/App/App/Plugins/PpPjsip/PpPjsipEngine.swift");

    expect(bridge).toContain('?? "TLS"');
    expect(bridge).toContain("guard transport == \"TLS\"");
    expect(bridge).toContain("guard port == 5061");
    expect(engine).toContain("PJSIP_TRANSPORT_TLS");
    expect(engine).not.toContain("PJSIP_TRANSPORT_TCP");
    expect(engine).toContain('"sip:\\(server):5061;transport=tls"');
    expect(engine).toContain('"sip:\\(server):5061;transport=tls;lr"');
  });

  it("starts the native outgoing INVITE only after CallKit requests audio", () => {
    const engine = read("ios/App/App/Plugins/PpPjsip/PpPjsipEngine.swift");
    const callKit = read("ios/App/App/Plugins/PpVoipCall/PpVoipCall.swift");

    expect(engine.indexOf("ppPjsipOutgoingStartRequested")).toBeLessThan(engine.indexOf("pjsua_call_make_call"));
    expect(engine).toContain("ppPjsipOutgoingAudioReady");
    expect(engine).toContain("guard audioSessionReady else");
    expect(callKit).toContain("CXStartCallAction");
    expect(callKit).toContain("ppPjsipOutgoingAudioReady");
    expect(callKit).toContain("if nativeOutgoingCall, let requestId = pendingOutgoingRequestId");
  });

  it("represents short internal extensions safely in CallKit and fails closed before INVITE", () => {
    const callKit = read("ios/App/App/Plugins/PpVoipCall/PpVoipCall.swift");

    expect(callKit).toContain("private func outgoingHandle(for destination: String) -> CXHandle");
    expect(callKit).toContain("let isInternalExtension = !value.hasPrefix");
    expect(callKit).toContain("isInternalExtension ? .generic : .phoneNumber");
    expect(callKit).toContain("armOutgoingActivationTimeout");
    expect(callKit).toContain("CallKit audio activation timed out before SIP INVITE");
    expect(callKit).toContain("failPendingOutgoingStart");
    expect(callKit).toContain("CallKit ended before SIP INVITE");
  });

  it("offers G.711 before optional codecs for iOS extension-to-extension calls", () => {
    const engine = read("ios/App/App/Plugins/PpPjsip/PpPjsipEngine.swift");

    // PJSIP matches codec identifiers by prefix. These priorities therefore
    // cover IDs with channel-count suffixes as well (for example PCMU/8000/1).
    expect(engine).toContain('("PCMU/8000", 255)');
    expect(engine).toContain('("PCMA/8000", 254)');
    expect(engine).toContain('("opus/48000", 200)');
    expect(engine).toContain('("G722/16000", 180)');
    expect(engine).toContain('("speex/32000", 0)');
    expect(engine).toContain('("speex/16000", 0)');
    expect(engine).toContain('("speex/8000", 0)');
    expect(engine).toContain('("iLBC/8000", 0)');
    expect(engine).toContain('("GSM/8000", 0)');
    expect(engine.indexOf("try check(pjsua_start()", engine.indexOf("ensureStackStarted"))).toBeLessThan(
      engine.indexOf("applyCodecPriorities()", engine.indexOf("ensureStackStarted")),
    );
  });

  it("keeps CallKit as the only iOS answer path while Android answers the same PJSIP dialogue", () => {
    const engine = read("ios/App/App/Plugins/PpPjsip/PpPjsipEngine.swift");
    const bridge = read("ios/App/App/Plugins/PpPjsip/PpPjsip.swift");
    const callKit = read("ios/App/App/Plugins/PpVoipCall/PpVoipCall.swift");
    const hook = read("src/hooks/useMplanipretSoftphone.ts");
    const nativeService = read("src/lib/planipret/sip/nativeSipService.ts");
    const keepAlive = read("ios/App/App/Plugins/PpSipKeepAlive/PpSipKeepAlive.swift");

    expect(callKit).toContain("CAPPluginMethod(name: \"requestAnswer\"");
    expect(callKit).toContain("CXAnswerCallAction");
    expect(bridge).not.toContain("CAPPluginMethod(name: \"answerCall\"");
    expect(nativeService).toContain("requestPlanipretCallKitAnswer()");
    expect(nativeService).toContain('if (Capacitor.getPlatform() === "ios") return requestPlanipretCallKitAnswer()');
    expect(nativeService).toContain('if (Capacitor.getPlatform() !== "android") return false');
    expect(nativeService).toContain("await pjsip.answerCall({ callId");
    expect(hook).not.toContain("nativeSip.answer().then((ok) => completePlanipretCallKitAnswer");
    expect(engine).toContain("answerInFlightCall");
    expect(engine).toContain("answeredCallIds");
    expect(engine).not.toContain("answer FALLBACK");
    expect(engine).toContain("pjsua_conf_adjust_tx_level");
    // Gain de lecture limité au flux entrant et uniquement en mains-libres :
    // ne modifie ni le micro ni la session audio dont CallKit reste propriétaire.
    expect(engine).toContain("private func applyPlaybackGain");
    expect(engine).toContain("pjsua_conf_adjust_rx_level(slot, speakerOn ? 2.2 : 1.0)");
    expect(engine).toContain("pjsua_set_null_snd_dev");
    expect(engine).toContain("pjsua_conf_disconnect");
    expect(keepAlive).toContain("pjsip_callkit_audio_owner");
    expect(keepAlive).toContain("audio reset skipped — PJSIP/CallKit owns session");
  });

  it("keeps the CallKit sound device open while linking bidirectional PJSIP media", () => {
    const engine = read("ios/App/App/Plugins/PpPjsip/PpPjsipEngine.swift");

    // PJSIP conference links are directional: both edges are required. A media
    // reattach may remove only those links, never the CallKit-owned device.
    expect(engine).toContain("pjsua_conf_connect(slot, 0)");
    expect(engine).toContain("pjsua_conf_connect(0, slot)");
    expect(engine).toContain('detachAudioMedia(reason: "reattach", releaseSoundDevice: false)');
    expect(engine).toContain("private func detachAudioMedia(reason: String, releaseSoundDevice: Bool = true)");
    expect(engine).toContain("guard releaseSoundDevice else { return }");
    expect(engine).toContain("pjsua_conf_adjust_tx_level(info.conf_slot, on ? 0.0 : 1.0)");
    expect(engine).toContain("pjsua_conf_adjust_tx_level(slot, muted ? 0.0 : 1.0)");
  });

  it("uses Swift-compatible PJSIP import types", () => {
    const engine = read("ios/App/App/Plugins/PpPjsip/PpPjsipEngine.swift");
    const keepAlive = read("ios/App/App/Plugins/PpSipKeepAlive/PpSipKeepAlive.swift");
    const callKit = read("ios/App/App/Plugins/PpVoipCall/PpVoipCall.swift");
    const generator = read("scripts/apply-native-config.mjs");

    expect(engine).toContain("Int(rdata.pointee.code)");
    expect(engine).toContain("lastCode: Int(info.last_status.rawValue)");
    expect(engine).not.toContain("code.rawValue");
    expect(engine).toContain("acc.lock_codec = 0");
    expect(engine).toContain("acc.use_rfc5626 = 1");
    expect(engine).not.toContain("UnsafeMutablePointer<pj_thread_t>");
    expect(engine).toContain("var handle: OpaquePointer?");
    expect(engine).toContain('pj_thread_register("pp-worker", desc, &handle)');
    expect(engine).not.toContain("PJSIP_EUNSUPTRANSPORT.rawValue");
    expect(keepAlive).not.toContain("self.nativeEngineOwnsAor");
    expect(callKit).toContain('(note.userInfo?["callId"] as? String) ?? ""');
    expect(generator).not.toContain("self.nativeEngineOwnsAor");
    expect(generator).toContain('(note.userInfo?["callId"] as? String) ?? ""');
  });

  it("closes a terminated native call without reviving a stale REST attachment", () => {
    const callKit = read("ios/App/App/Plugins/PpVoipCall/PpVoipCall.swift");
    const hook = read("src/hooks/useMplanipretSoftphone.ts");
    const shell = read("src/pages/planipret/PlanipretMobile.tsx");
    const nativeService = read("src/lib/planipret/sip/nativeSipService.ts");

    // Un évènement PJSIP qui ne correspond plus à un UUID natif est ignoré
    // avant tout nettoyage, donc ne peut pas fermer un appel de remplacement.
    expect(callKit).toContain("guard let uuid = self.nativeCalls.first(where: { $0.value == endedCallId })?.key");
    expect(callKit).toContain("?? (self.activeCallId == endedCallId ? self.activeCallUUID : nil) else { return }");
    expect(callKit).toContain("stale reportCallEnded ignored");
    expect(callKit).toContain("Let the CXEndCallAction delegate own cleanup");
    expect(hook).toContain("stale native end ignored");
    expect(hook).toContain("A PJSIP/CallKit termination is authoritative for the visible call");
    expect(hook).toContain("setRestCall((current) => current?.id === endedRestCallId ? null : current)");
    expect(shell).toContain('window.addEventListener("pp:call-ended", onNativeEnded');
    expect(shell).toContain("DISMISSED_CALL_GRACE_MS");
    expect(shell).toContain('update({ status: "ended", ended_at: endedAt } as any)');
    expect(nativeService).toContain("const targetCallId = this.currentCallId");
    expect(nativeService).toContain("endCallKit(targetCallId)");
  });

  it("retries only the same PJSIP dialog when a local hangup did not close the remote leg", () => {
    const engine = read("ios/App/App/Plugins/PpPjsip/PpPjsipEngine.swift");

    expect(engine).toContain('attemptHangup("primary")');
    expect(engine).toContain('attemptHangup("retry")');
    expect(engine).toContain("private var callGenerations: [Int32: UInt64] = [:]");
    expect(engine).toContain("guard self.callGenerations[Int32(target)] == generation,");
    expect(engine).toContain("self.callIds.contains(Int32(target)) else { return }");
    expect(engine).toContain("pjsua_call_hangup(target, UInt32(code), nil, nil)");
  });

  it("does not reopen CallKit for a retransmitted INVITE on the same dialog", () => {
    const engine = read("ios/App/App/Plugins/PpPjsip/PpPjsipEngine.swift");

    expect(engine).toContain("if activeCall == callId {");
    expect(engine).toContain("duplicate incoming INVITE ignored");
    expect(engine).toContain("if activeCall >= 0 {");
  });

  it("refuses a JsSIP answer without a live microphone and cleans media", () => {
    const provider = read("src/lib/planipret/sip/ppSipProvider.ts");

    expect(provider).toContain("microphone_track_unavailable");
    expect(provider).toContain("Microphone unavailable");
    expect(provider).toContain("cleanupCallMedia()");
    expect(provider).toContain("this.localMediaStreams");
    expect(provider).toContain("this.retainLocalMedia(mediaStream)");
  });

  it("never lets the Android wake service impersonate a media-capable SIP UAS", () => {
    const generator = read("scripts/apply-native-config.mjs");
    const verifier = read("scripts/verify-android.mjs");

    expect(generator).toContain('android:foregroundServiceType="dataSync"');
    expect(generator).toContain("FOREGROUND_SERVICE_TYPE_DATA_SYNC");
    expect(generator).toContain("wake_only_no_media_engine");
    expect(generator).toContain("ACTION_REREGISTER.equals(action)");
    expect(generator).toContain("Aucun REGISTER de fond au démarrage");
    expect(verifier).toContain("wake-only service");
  });

  it("does not let an ungranted microphone foreground-service type crash Android at startup", () => {
    const service = read("android/app/src/main/java/com/planipret/mobile/PpPjsipService.java");
    const engine = read("android/app/src/main/java/com/planipret/mobile/PpPjsipEngine.java");

    expect(service).toContain("ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)");
    expect(service).toContain("if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && hasMicrophonePermission())");
    expect(service).toContain("catch (SecurityException | IllegalStateException error)");
    expect(service).toContain("static boolean prepareForCall(Context context)");
    expect(engine).toContain("ensureMicrophoneServiceForCallLocked();");
    expect(engine).toContain("PpPjsipService.prepareForCall(appContext)");
    expect(engine).toContain('"microphone_permission_required"');
  });

  it("keeps SWIG callbacks used only by JNI and contains a binary mismatch without killing Android", () => {
    const engine = read("android/app/src/main/java/com/planipret/mobile/PpPjsipEngine.java");
    const plugin = read("android/app/src/main/java/com/planipret/mobile/PpPjsipPlugin.java");
    const appRules = read("android/app/proguard-rules.pro");
    const moduleRules = read("android/pjsua2/consumer-rules.pro");

    expect(engine).toContain('Class.forName("org.pjsip.pjsua2.pjsua2JNI")');
    expect(plugin).toContain("catch (Throwable error)");
    expect(plugin).toContain("private static String safeReason(Throwable error)");
    expect(appRules).toContain("-keep class org.pjsip.pjsua2.** { *; }");
    expect(moduleRules).toContain("-keep class org.pjsip.pjsua2.** { *; }");
  });

  it("keeps the Android launcher activity present in the Planiprêt package", () => {
    const manifest = read("android/app/src/main/AndroidManifest.xml");
    const activity = read("android/app/src/main/java/com/planipret/mobile/MainActivity.java");

    expect(manifest).toContain('android:name=".MainActivity"');
    expect(activity).toContain("package com.planipret.mobile;");
    expect(activity).toContain("class MainActivity extends BridgeActivity");
  });

  it("lets Android Keystore generate the AES-GCM IV and discards incompatible legacy sessions safely", () => {
    const engine = read("android/app/src/main/java/com/planipret/mobile/PpPjsipEngine.java");
    const instrumented = read("android/app/src/androidTest/java/com/planipret/mobile/PpPjsipSecureSessionInstrumentedTest.java");

    expect(engine).toContain("cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey(keyAlias));");
    expect(engine).toContain("byte[] iv = cipher.getIV();");
    expect(engine).not.toContain("new SecureRandom().nextBytes(iv)");
    expect(engine).not.toContain("Cipher.ENCRYPT_MODE, getOrCreateKey(), new GCMParameterSpec");
    expect(engine).toContain('if (envelope.optInt("v", 0) != 2)');
    expect(engine).toContain("prefs.edit().remove(blobName).apply()");
    expect(engine).toContain("verifySecureSessionRoundTripForInstrumentation");
    expect(engine).toContain("persistSessionForWakeBestEffort");
    expect(engine).toContain("foreground M/TLS registration continues");
    expect(engine).toContain("verifyLegacySessionIsDiscardedForInstrumentation");
    expect(engine).toContain("edit().remove(SECURE_BLOB).apply()");
    expect(instrumented).toContain('"1142M"');
    expect(instrumented).toContain("example.invalid");
    expect(instrumented).toContain("discardsLegacySecureSessionWithoutPbXActivity");
    expect(instrumented).toContain("verifyLegacySessionIsDiscardedForInstrumentation");
    expect(instrumented).not.toContain("PpPjsipEngine.initialize(");
    expect(instrumented).not.toContain("wakeForIncoming");
  });

  it("keeps Android M/TLS verification strict with the bundled public trust anchor", () => {
    const engine = read("android/app/src/main/java/com/planipret/mobile/PpPjsipEngine.java");
    const ca = read("android/app/src/main/res/raw/isrg_root_x1.pem");
    const templateCa = read("scripts/templates/android/isrg_root_x1.pem");

    expect(engine).toContain("setVerifyServer(true)");
    expect(engine).toContain("setCaBuf(planipretTlsCa(appContext))");
    expect(engine).toContain("class PlanipretEndpoint extends Endpoint");
    expect(engine).toContain("getVerifyStatus()");
    expect(ca).toContain("BEGIN CERTIFICATE");
    expect(ca).toContain("AIIQz7DSQONZRGPgu2OCiwA");
    expect(templateCa).toBe(ca);
  });

  it("never returns an iOS or Android M/TLS AOR to JsSIP after a native failure", () => {
    const arbitration = read("src/lib/planipret/sip/aorArbitration.ts");
    const nativeService = read("src/lib/planipret/sip/nativeSipService.ts");
    const route = read("src/lib/planipret/sip/outboundRoute.ts");

    expect(arbitration).toContain("function mandatoryNativeMobile()");
    expect(arbitration).toContain("W/WSS fallback prohibited");
    expect(nativeService).not.toContain("releaseAorFromNative(");
    expect(route).toContain("return false;");
    expect(route).toContain('"native_unregistered"');
  });

  it("never presents an Android native engine as registered from server state alone", () => {
    const debug = read("src/pages/planipret/mobile/MSipDebug.tsx");

    expect(debug).toContain('nativeState === "registered"\n      ? "registered"');
    expect(debug).not.toContain('nativeState === "registered" || pbxRegistered');
    expect(debug).toContain("Server-side registration remains visible separately in the Phone system card.");
  });
});
