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

type PpSipKeepAlivePlugin = {
  startSipService?: (opts: Record<string, unknown>) => Promise<PpNativeSipStatus>;
  stopSipService?: () => Promise<PpNativeSipStatus>;
  getSipServiceStatus?: () => Promise<PpNativeSipStatus>;
  requestBatteryOptimizationExemption?: () => Promise<PpNativeSipStatus>;
  triggerReregister?: () => Promise<PpNativeSipStatus>;
  addListener?: (event: "sipServiceStatus" | "sipReregisterRequested", cb: (data: PpNativeSipStatus) => void) => Promise<ListenerHandle>;
};

const isNative = () => {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
};

const platform = () => {
  try { return Capacitor.getPlatform(); } catch { return "web"; }
};

const NativePpSip: PpSipKeepAlivePlugin = isNative()
  ? registerPlugin<PpSipKeepAlivePlugin>("PpSipKeepAlive")
  : {};

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
  if (!isNative()) return null;
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
    console.warn("[pp-sip-native] start failed", e);
    return null;
  }
}

export async function getPlanipretSipKeepAliveStatus(): Promise<PpNativeSipStatus | null> {
  if (!isNative()) return null;
  try { return await NativePpSip.getSipServiceStatus?.() ?? null; }
  catch (e) { console.warn("[pp-sip-native] status failed", e); return null; }
}

export async function stopPlanipretSipKeepAlive(): Promise<void> {
  if (!isNative()) return;
  try { await NativePpSip.stopSipService?.(); }
  catch (e) { console.warn("[pp-sip-native] stop failed", e); }
}

export async function requestPlanipretBatteryOptimizationExemption(): Promise<void> {
  if (platform() !== "android") return;
  try { await NativePpSip.requestBatteryOptimizationExemption?.(); }
  catch (e) { console.warn("[pp-sip-native] battery exemption failed", e); }
}

export async function triggerPlanipretNativeReregister(): Promise<void> {
  if (!isNative()) return;
  try { await NativePpSip.triggerReregister?.(); }
  catch (e) { console.warn("[pp-sip-native] native reregister failed", e); }
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
