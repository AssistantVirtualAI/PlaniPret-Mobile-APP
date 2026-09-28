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

  it("uses CallKit as the only iOS answer path and releases media deterministically", () => {
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
    expect(nativeService).not.toContain("pjsip.answerCall({ callId");
    expect(hook).not.toContain("nativeSip.answer().then((ok) => completePlanipretCallKitAnswer");
    expect(engine).toContain("answerInFlightCall");
    expect(engine).toContain("answeredCallIds");
    expect(engine).not.toContain("answer FALLBACK");
    expect(engine).toContain("pjsua_conf_adjust_tx_level");
    expect(engine).not.toContain("pjsua_conf_adjust_rx_level");
    expect(engine).toContain("pjsua_set_null_snd_dev");
    expect(engine).toContain("pjsua_conf_disconnect");
    expect(keepAlive).toContain("pjsip_callkit_audio_owner");
    expect(keepAlive).toContain("audio reset skipped — PJSIP/CallKit owns session");
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

    expect(callKit).toContain("stale PJSIP end ignored");
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
});
