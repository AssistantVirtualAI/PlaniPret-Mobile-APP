import { Capacitor, registerPlugin } from "@capacitor/core";
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
  action?: "answer" | "decline";
};

type PpSipKeepAlivePlugin = {
  startSipService?: (opts: Record<string, unknown>) => Promise<PpNativeSipStatus>;
  stopSipService?: () => Promise<PpNativeSipStatus>;
  getSipServiceStatus?: () => Promise<PpNativeSipStatus>;
  requestBatteryOptimizationExemption?: () => Promise<PpNativeSipStatus>;
  triggerReregister?: () => Promise<PpNativeSipStatus>;
  acknowledgeIncoming?: () => Promise<{ ok: boolean }>;
  addListener?: (
    event: "sipServiceStatus" | "sipReregisterRequested" | "sipIncomingInvite",
    cb: (data: any) => void,
  ) => Promise<ListenerHandle>;
};

type PpVoipCallPlugin = {
  getVoipPushToken?: () => Promise<{ token: string | null; platform: string; bundleId?: string; environment?: string }>;
  reportCallEnded?: (opts: { callId?: string; reason?: string }) => Promise<{ ok: boolean }>;
  addListener?: (
    event:
      | "voipPushToken"
      | "incomingCallAnswered"
      | "incomingCallRejected"
      | "callKitReady",
    cb: (data: any) => void,
  ) => Promise<ListenerHandle>;
};

const isNative = () => {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
};

const platform = () => {
  try { return Capacitor.getPlatform(); } catch { return "web"; }
};


// Some builds ship without the native SIP/VoIP plugins compiled in. Capacitor
// then rejects every call with `UNIMPLEMENTED`, which used to spam the console
// on every 15s poll. Latch the unavailability once and no-op afterwards.
const unavailable = { sip: false, voip: false };
function isUnimplemented(e: unknown): boolean {
  const anyE = e as any;
  return String(anyE?.code ?? "") === "UNIMPLEMENTED"
    || /unimplemented|not implemented/i.test(String(anyE?.message ?? ""));
}
function markUnavailable(kind: "sip" | "voip", e: unknown, label: string): boolean {
  if (!isUnimplemented(e)) return false;
  if (!unavailable[kind]) {
    unavailable[kind] = true;
    console.warn(`[${label}] native plugin unavailable in this build — disabling native SIP guard`);
  }
  return true;
}
export function isPlanipretNativeSipAvailable(): boolean { return isNative() && !unavailable.sip; }

const NativePpSip: PpSipKeepAlivePlugin = isNative()
  ? registerPlugin<PpSipKeepAlivePlugin>("PpSipKeepAlive")
  : {};

const NativePpVoipCall: PpVoipCallPlugin = isNative()
  ? registerPlugin<PpVoipCallPlugin>("PpVoipCall")
  : {};

// ---------- CallKit + PushKit bridge (iOS only) ----------
export async function getPlanipretVoipPushToken(): Promise<{ token: string | null; platform: string; bundleId?: string; environment?: string } | null> {
  if (platform() !== "ios" || unavailable.voip) return null;
  try { return (await NativePpVoipCall.getVoipPushToken?.()) ?? null; }
  catch (e) {
    if (!markUnavailable("voip", e, "pp-voip-call")) console.warn("[pp-voip-call] getVoipPushToken failed", e);
    return null;
  }
}

export async function onPlanipretVoipPushToken(cb: (data: { token: string; bundleId?: string; environment?: string }) => void): Promise<() => void> {
  if (platform() !== "ios" || !NativePpVoipCall.addListener) return () => undefined;
  try {
    const handle = await NativePpVoipCall.addListener("voipPushToken", (data: any) => cb(data ?? {}));
    return () => { void handle?.remove?.(); };
  } catch { return () => undefined; }
}

export async function onPlanipretIncomingCallAnswered(cb: (data: { callUUID: string; callId?: string }) => void): Promise<() => void> {
  if (platform() !== "ios" || !NativePpVoipCall.addListener) return () => undefined;
  try {
    const handle = await NativePpVoipCall.addListener("incomingCallAnswered", (data: any) => cb(data ?? {}));
    return () => { void handle?.remove?.(); };
  } catch { return () => undefined; }
}

export async function onPlanipretIncomingCallRejected(cb: (data: { callUUID: string; callId?: string }) => void): Promise<() => void> {
  if (platform() !== "ios" || !NativePpVoipCall.addListener) return () => undefined;
  try {
    const handle = await NativePpVoipCall.addListener("incomingCallRejected", (data: any) => cb(data ?? {}));
    return () => { void handle?.remove?.(); };
  } catch { return () => undefined; }
}

export async function reportPlanipretCallEnded(callId?: string, reason?: string): Promise<void> {
  if (platform() !== "ios") return;
  try { await NativePpVoipCall.reportCallEnded?.({ callId, reason }); }
  catch { /* noop */ }
}

function parseWss(cfg: PpSipConfig) {
  try {
    const url = new URL(cfg.wssUrl);
    return {
      host: url.hostname,
      port: Number(url.port || (url.protocol === "wss:" ? 443 : 80)),
      path: `${url.pathname || "/"}${url.search || ""}`,
    };
  } catch {
    return { host: cfg.sipProxy || cfg.sipDomain, port: 443, path: "/" };
  }
}

export async function startPlanipretSipKeepAlive(cfg: PpSipConfig): Promise<PpNativeSipStatus | null> {
  if (!isPlanipretNativeSipAvailable()) return null;
  const wss = parseWss(cfg);
  try {
    const result = await NativePpSip.startSipService?.({
      ...wss,
      extension: cfg.extension,
      username: cfg.sipUsername,
      login: cfg.sipUsername,
      password: cfg.password,
      domain: cfg.sipDomain,
      displayName: cfg.displayName || cfg.extension,
      transport: "wss",
      wssUrl: cfg.wssUrl,
    });
    if (platform() === "android") {
      void NativePpSip.requestBatteryOptimizationExemption?.().catch(() => undefined);
    }
    return result ?? null;
  } catch (e) {
    if (!markUnavailable("sip", e, "pp-sip-native")) console.warn("[pp-sip-native] start failed", e);
    return null;
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

export async function requestPlanipretBatteryOptimizationExemption(): Promise<void> {
  if (platform() !== "android" || unavailable.sip) return;
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
  if (!isNative() || !NativePpSip.addListener) return () => undefined;
  try {
    const handle = await NativePpSip.addListener("sipServiceStatus", cb);
    return () => { void handle?.remove?.(); };
  } catch {
    return () => undefined;
  }
}

export async function onPlanipretNativeReregister(cb: () => void): Promise<() => void> {
  if (!isNative() || !NativePpSip.addListener) return () => undefined;
  try {
    const handle = await NativePpSip.addListener("sipReregisterRequested", () => cb());
    return () => { void handle?.remove?.(); };
  } catch {
    return () => undefined;
  }
}

/** Fires whenever the native SIP socket sees an INVITE while the WebView is
 *  suspended, and again with `action: "answer" | "decline"` when the user taps
 *  the corresponding button on the Android full-screen notification (iOS uses
 *  the local notification banner + CallKit). Planiprêt-only. */
export async function onPlanipretIncomingInvite(cb: (invite: PpIncomingInvite) => void): Promise<() => void> {
  if (!isNative() || !NativePpSip.addListener) return () => undefined;
  try {
    const handle = await NativePpSip.addListener("sipIncomingInvite", (data: PpIncomingInvite) => cb(data ?? {}));
    return () => { void handle?.remove?.(); };
  } catch {
    return () => undefined;
  }
}

export async function acknowledgePlanipretIncoming(): Promise<void> {
  if (!isNative()) return;
  try { await NativePpSip.acknowledgeIncoming?.(); }
  catch { /* noop */ }
}
