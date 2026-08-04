import { Capacitor, registerPlugin } from "@capacitor/core";
import { getPpSipReconnectConfig } from "./ppSipReconnectConfig";
import { addDedupedCapListener } from "./capListeners";
import { edgeOnlyWssUrls } from "./sipEdgePolicy";
import type { PpSipConfig } from "./ppSipProvider";

export type PpNativeSipStatus = {
  ok?: boolean;
  status?: "idle" | "protected" | "connecting" | "registered" | "reconnecting" | "disconnected" | "error" | string;
  reason?: string;
  updatedAt?: number;
  wakeLockHeld?: boolean;
  wifiLockHeld?: boolean;
  backgroundTaskActive?: boolean;
  loggedIn?: boolean;
};

type ListenerHandle = { remove: () => Promise<void> | void };

export type PpIncomingInvite = {
  callId?: string;
  from?: string;
  fromUser?: string;
  fromDisplay?: string;
  /** Present only when user tapped Answer / Decline on the native notification. */
  action?: "answer" | "decline" | "cancelled";
};

type PpSipKeepAlivePlugin = {
  startSipService?: (opts: Record<string, unknown>) => Promise<PpNativeSipStatus>;
  stopSipService?: () => Promise<PpNativeSipStatus>;
  getSipServiceStatus?: () => Promise<PpNativeSipStatus>;
  requestBatteryOptimizationExemption?: () => Promise<PpNativeSipStatus>;
  triggerReregister?: () => Promise<PpNativeSipStatus>;
  acknowledgeIncoming?: () => Promise<{ ok: boolean }>;
  wakeForIncomingCall?: (opts?: { reason?: string }) => Promise<PpNativeSipStatus>;
  setCallActive?: (opts: { active: boolean }) => Promise<PpNativeSipStatus>;
  declareJsOwnsAor?: (opts: { owns: boolean }) => Promise<PpNativeSipStatus>;
  declareNativeEngineOwnsAor?: (opts: { owns: boolean }) => Promise<PpNativeSipStatus>;
  addListener?: (
    event: "sipServiceStatus" | "sipReregisterRequested" | "sipIncomingInvite",
    cb: (data: any) => void,
  ) => Promise<ListenerHandle>;
};

type PpVoipCallPlugin = {
  getVoipPushToken?: () => Promise<{ token: string | null; platform: string; bundleId?: string; environment?: string }>;
  refreshVoipPushToken?: () => Promise<{ ok: boolean; token?: string }>;
  reportCallEnded?: (opts: { callId?: string; reason?: string }) => Promise<{ ok: boolean }>;
  completeAnswer?: (opts: { callId?: string; ok: boolean }) => Promise<{ ok: boolean; reason?: string }>;
  addListener?: (
    event:
      | "voipPushToken"
      | "voipPushTokenInvalidated"
      | "incomingCallAnswered"
      | "incomingCallRejected"
      | "callKitReady"
      | "audioSessionActivated"
      | "audioSessionDeactivated",
    cb: (data: any) => void,
  ) => Promise<ListenerHandle>;
};

const isNative = () => {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
};

const platform = () => {
  try { return Capacitor.getPlatform(); } catch { return "web"; }
};


// Some previews/builds can report `UNIMPLEMENTED` before the native bridge is
// ready. Do not disable SIP forever after one miss: background registration
// must recover when the real native plugin is present.
const unavailable = {
  sip: { until: 0, warned: false },
  voip: { until: 0, warned: false },
};
function isUnimplemented(e: unknown): boolean {
  const anyE = e as any;
  return String(anyE?.code ?? "") === "UNIMPLEMENTED"
    || /unimplemented|not implemented/i.test(String(anyE?.message ?? ""));
}
function markUnavailable(kind: "sip" | "voip", e: unknown, label: string): boolean {
  if (!isUnimplemented(e)) return false;
  const state = unavailable[kind];
  state.until = Date.now() + 60_000;
  if (!state.warned) {
    state.warned = true;
    console.warn(`[${label}] native plugin unavailable — retrying later`);
  }
  return true;
}
const isTemporarilyUnavailable = (kind: "sip" | "voip") => Date.now() < unavailable[kind].until;
export function isPlanipretNativeSipAvailable(): boolean { return isNative() && !isTemporarilyUnavailable("sip"); }

const NativePpSip: PpSipKeepAlivePlugin = isNative()
  ? registerPlugin<PpSipKeepAlivePlugin>("PpSipKeepAlive")
  : {};

const NativePpVoipCall: PpVoipCallPlugin = isNative()
  ? registerPlugin<PpVoipCallPlugin>("PpVoipCall")
  : {};

// ---------- CallKit + PushKit bridge (iOS only) ----------
export async function getPlanipretVoipPushToken(): Promise<{ token: string | null; platform: string; bundleId?: string; environment?: string } | null> {
  if (platform() !== "ios" || isTemporarilyUnavailable("voip")) return null;
  try { return (await NativePpVoipCall.getVoipPushToken?.()) ?? null; }
  catch (e) {
    if (!markUnavailable("voip", e, "pp-voip-call")) console.warn("[pp-voip-call] getVoipPushToken failed", e);
    return null;
  }
}

/** Ask PushKit to re-issue the VoIP token (app resume / backend rejected token). */
export async function refreshPlanipretVoipPushToken(): Promise<boolean> {
  if (platform() !== "ios" || isTemporarilyUnavailable("voip")) return false;
  try { const r = await NativePpVoipCall.refreshVoipPushToken?.(); return !!r?.ok; }
  catch (e) {
    if (!markUnavailable("voip", e, "pp-voip-call")) console.warn("[pp-voip-call] refreshVoipPushToken failed", e);
    return false;
  }
}

export async function onPlanipretVoipPushTokenInvalidated(cb: () => void): Promise<() => void> {
  if (platform() !== "ios") return () => undefined;
  return addDedupedCapListener("PpVoipCall", NativePpVoipCall, "voipPushTokenInvalidated", () => cb());
}

export async function onPlanipretVoipPushToken(cb: (data: { token: string; bundleId?: string; environment?: string; changed?: boolean; source?: string }) => void): Promise<() => void> {
  if (platform() !== "ios") return () => undefined;
  return addDedupedCapListener("PpVoipCall", NativePpVoipCall, "voipPushToken", (data: any) => cb(data ?? {}));
}

export async function onPlanipretIncomingCallAnswered(cb: (data: { callUUID: string; callId?: string }) => void): Promise<() => void> {
  if (platform() !== "ios") return () => undefined;
  return addDedupedCapListener("PpVoipCall", NativePpVoipCall, "incomingCallAnswered", (data: any) => cb(data ?? {}));
}

export async function onPlanipretIncomingCallRejected(cb: (data: { callUUID: string; callId?: string }) => void): Promise<() => void> {
  if (platform() !== "ios") return () => undefined;
  return addDedupedCapListener("PpVoipCall", NativePpVoipCall, "incomingCallRejected", (data: any) => cb(data ?? {}));
}

// ring17: CallKit owns the AVAudioSession. The microphone track is only
// guaranteed live after `didActivate`, so re-assert local audio then.
if (platform() === "ios") {
  void addDedupedCapListener("PpVoipCall", NativePpVoipCall, "audioSessionActivated", (data: any) => {
    try {
      window.dispatchEvent(new CustomEvent("pp:callkit-audio-active", { detail: data ?? {} }));
    } catch { /* noop */ }
  });
}




/**
 * iOS cannot keep a WSS socket alive while suspended: PushKit is the only
 * guaranteed wake. When a VoIP push lands, ask the native keep-alive to
 * re-REGISTER immediately (debounce-free) so the INVITE can be delivered.
 */
export type PpSipWakeReason = "voip_push" | "fcm_push" | (string & {});

/** iOS PushKit ("voip_push") and Android FCM data message ("fcm_push") share
 *  the exact same wake path: force an immediate re-REGISTER. */
export async function wakePlanipretNativeSipForIncomingCall(reason: PpSipWakeReason = "voip_push"): Promise<PpNativeSipStatus | null> {
  if (!isPlanipretNativeSipAvailable()) return null;
  try { return (await NativePpSip.wakeForIncomingCall?.({ reason })) ?? null; }
  catch (e) {
    if (!markUnavailable("sip", e, "pp-sip-keepalive")) console.warn("[pp-sip] wakeForIncomingCall failed", e);
    return null;
  }
}

/** Fired by PpVoipCall when a VoIP push produced a CallKit incoming call. */
export async function onPlanipretVoipIncomingCall(
  cb: (data: { callId?: string; callUUID?: string; callerName?: string; callerNumber?: string }) => void,
): Promise<() => void> {
  if (platform() !== "ios") return () => undefined;
  return addDedupedCapListener("PpVoipCall", NativePpVoipCall, "callKitReady", (data: any) => {
    if (data?.callId) cb(data);
  });
}

export async function reportPlanipretCallEnded(callId?: string, reason?: string): Promise<void> {
  if (platform() !== "ios") return;
  try { await NativePpVoipCall.reportCallEnded?.({ callId, reason }); }
  catch { /* noop */ }
}

export async function completePlanipretCallKitAnswer(callId: string | undefined, ok: boolean): Promise<void> {
  if (platform() !== "ios") return;
  try { await NativePpVoipCall.completeAnswer?.({ callId, ok }); }
  catch (error) { console.warn("[pp-voip-call] completeAnswer failed", error); }
}

function parseWss(cfg: PpSipConfig) {
  try {
    const edgeUrl = edgeOnlyWssUrls([cfg.wssUrl, ...(cfg.wssUrls ?? [])])[0];
    const url = new URL(edgeUrl);
    return {
      host: url.hostname,
      port: Number(url.port || (url.protocol === "wss:" ? 443 : 80)),
      path: `${url.pathname || "/"}${url.search || ""}`,
      wssUrl: edgeUrl,
    };
  } catch {
    const edgeUrl = edgeOnlyWssUrls([])[0];
    const url = new URL(edgeUrl);
    return { host: url.hostname, port: Number(url.port || 443), path: `${url.pathname || "/"}${url.search || ""}`, wssUrl: edgeUrl };
  }
}

let _sipStartPending = false;

export async function startPlanipretSipKeepAlive(cfg: PpSipConfig): Promise<PpNativeSipStatus | null> {
  if (!isPlanipretNativeSipAvailable()) return null;
  if (_sipStartPending) return null;
  _sipStartPending = true;
  const wss = parseWss(cfg);
  if (wss.wssUrl !== cfg.wssUrl) {
    console.warn(`[pp-sip-native] non-core WSS replaced with pinned core → ${wss.wssUrl}`);
  }
  try {
    const result = await NativePpSip.startSipService?.({
      host: wss.host,
      port: wss.port,
      path: wss.path,
      extension: cfg.extension,
      username: cfg.sipUsername,
      login: cfg.sipUsername,
      password: cfg.password,
      domain: cfg.sipDomain,
      displayName: cfg.displayName || cfg.extension,
      transport: "wss",
      wssUrl: wss.wssUrl,
      // Reconnection strategy is configured once in JS (config file / env vars)
      // and forwarded to the native keep-alive so iOS and Android behave the same.
      backoffMinMs: getPpSipReconnectConfig().nativeBackoffMinMs,
      backoffMaxMs: getPpSipReconnectConfig().nativeBackoffMaxMs,
      backoffMaxAttempts: getPpSipReconnectConfig().socketBackoffMaxAttempts,
      verifyDelayMs: getPpSipReconnectConfig().nativeVerifyDelayMs,
      heartbeatSec: getPpSipReconnectConfig().nativeHeartbeatSec,
      registerExpiresSec: getPpSipReconnectConfig().nativeRegisterExpiresSec,
    });
    if (platform() === "android") {
      void NativePpSip.requestBatteryOptimizationExemption?.().catch(() => undefined);
    }
    return result ?? null;
  } catch (e) {
    if (!markUnavailable("sip", e, "pp-sip-native")) console.warn("[pp-sip-native] start failed", e);
    return null;
  } finally {
    _sipStartPending = false;
  }
}

export async function getPlanipretSipKeepAliveStatus(): Promise<PpNativeSipStatus | null> {
  if (!isPlanipretNativeSipAvailable()) return null;
  try { return await NativePpSip.getSipServiceStatus?.() ?? null; }
  catch (e) {
    if (!markUnavailable("sip", e, "pp-sip-native")) console.warn("[pp-sip-native] status failed", e);
    return null;
  }
}

export async function stopPlanipretSipKeepAlive(): Promise<void> {
  if (!isPlanipretNativeSipAvailable()) return;
  try { await NativePpSip.stopSipService?.(); }
  catch (e) { console.warn("[pp-sip-native] stop failed", e); }
}

/**
 * Tell the native layer a WebRTC call is live. It then keeps the iOS audio
 * session active in background (WebKit otherwise interrupts it => no audio)
 * and never takes the SIP AOR over while the call is up.
 */
export async function setPlanipretNativeCallActive(active: boolean): Promise<void> {
  if (!isPlanipretNativeSipAvailable()) return;
  try { await NativePpSip.setCallActive?.({ active }); }
  catch (e) {
    if (!markUnavailable("sip", e, "pp-sip-native")) console.warn("[pp-sip-native] setCallActive failed", e);
  }
}



export async function requestPlanipretBatteryOptimizationExemption(): Promise<void> {
  if (platform() !== "android" || isTemporarilyUnavailable("sip")) return;
  try { await NativePpSip.requestBatteryOptimizationExemption?.(); }
  catch (e) { console.warn("[pp-sip-native] battery exemption failed", e); }
}

export async function triggerPlanipretNativeReregister(): Promise<void> {
  if (!isPlanipretNativeSipAvailable()) return;
  try { await NativePpSip.triggerReregister?.(); }
  catch (e) {
    if (!markUnavailable("sip", e, "pp-sip-native")) console.warn("[pp-sip-native] native reregister failed", e);
  }
}

export async function onPlanipretSipKeepAliveStatus(cb: (status: PpNativeSipStatus) => void): Promise<() => void> {
  if (!isNative()) return () => undefined;
  return addDedupedCapListener("PpSipKeepAlive", NativePpSip, "sipServiceStatus", (data: any) => cb(data as PpNativeSipStatus));
}

export async function onPlanipretNativeReregister(cb: () => void): Promise<() => void> {
  if (!isNative()) return () => undefined;
  return addDedupedCapListener("PpSipKeepAlive", NativePpSip, "sipReregisterRequested", () => cb());
}

/** Fires whenever the native SIP socket sees an INVITE while the WebView is
 *  suspended, and again with `action: "answer" | "decline"` when the user taps
 *  the corresponding button on the Android full-screen notification (iOS uses
 *  the local notification banner + CallKit). Planiprêt-only. */
export async function onPlanipretIncomingInvite(cb: (invite: PpIncomingInvite) => void): Promise<() => void> {
  if (!isNative()) return () => undefined;
  return addDedupedCapListener("PpSipKeepAlive", NativePpSip, "sipIncomingInvite", (data: any) => cb((data ?? {}) as PpIncomingInvite));
}


/**
 * R3 (ring9): tell the native keep-alive that JsSIP holds the shared 113M AOR.
 * The legacy signal was `releaseRegistration("...js_owns")`, which the native
 * side REFUSES while `incomingPendingUntil` is armed — i.e. exactly while the
 * phone rings, when the handoff matters most.
 */
export async function declarePlanipretJsOwnsAor(owns: boolean): Promise<void> {
  if (!isPlanipretNativeSipAvailable()) return;
  try { await NativePpSip.declareJsOwnsAor?.({ owns }); }
  catch { /* older native build: ignore */ }
}

/** Keep the legacy WSS native service passive while PJSIP/TLS owns `<ext>M`. */
export async function declarePlanipretNativeEngineOwnsAor(owns: boolean): Promise<void> {
  if (!isPlanipretNativeSipAvailable()) return;
  try { await NativePpSip.declareNativeEngineOwnsAor?.({ owns }); }
  catch { /* older native build: build guard will prevent release */ }
}

export async function acknowledgePlanipretIncoming(): Promise<void> {
  if (!isNative()) return;
  try { await NativePpSip.acknowledgeIncoming?.(); }
  catch { /* noop */ }
}
