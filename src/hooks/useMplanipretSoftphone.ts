// Planipret mobile — softphone hook bound to the NS-API PBX.
//
// This is fully independent from the Lemtel softphone: registration uses the
// NS-API SIP credentials returned by the `ns-resolve-sip-credentials` edge
// function, and RTP flows through NS-API. Layered on top:
//   - Stronger microphone constraints (getAudioConstraints) with a
//     `navigator.mediaDevices.getUserMedia` proxy scoped to Planipret calls.
//   - Auto network handover (Wi-Fi ↔ LTE) via handoverController.
//   - Live call-quality sampling via callQualitySampler.
//   - Outbound fallback to `pp-ns-calls action:start` when WebRTC is not registered
//     ("both, with fallback" policy).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getPpSipReconnectConfig } from "@/lib/planipret/sip/ppSipReconnectConfig";
import { ppSipProvider, type PpSipConfig, type PpSipSnapshot } from "@/lib/planipret/sip/ppSipProvider";
import { startSipStabilityMonitor } from "@/lib/planipret/sip/sipStabilityMonitor";
import { networkMonitor, type NetSample } from "@/lib/planipret/network/networkMonitor";
import { handoverController } from "@/lib/planipret/net/handoverController";
import { callQualitySampler, type CallQualitySnapshot } from "@/lib/planipret/audio/callQualitySampler";
import { getAudioConstraints, type NCMode } from "@/lib/planipret/audio/audioConstraints";
import { ensureMicPermission, type MicPermissionState } from "@/lib/planipret/audio/micPermission";
import {
  acknowledgePlanipretIncoming,
  getPlanipretSipKeepAliveStatus,
  getPlanipretVoipPushToken,
  onPlanipretIncomingCallAnswered,
  onPlanipretIncomingCallRejected,
  onPlanipretIncomingInvite,
  onPlanipretNativeReregister,
  onPlanipretSipKeepAliveStatus,
  onPlanipretVoipIncomingCall,
  onPlanipretVoipPushToken,
  onPlanipretVoipPushTokenInvalidated,
  refreshPlanipretVoipPushToken,
  wakePlanipretNativeSipForIncomingCall,
  reportPlanipretCallEnded,
  requestPlanipretBatteryOptimizationExemption,
  startPlanipretSipKeepAlive,
  stopPlanipretSipKeepAlive,
  type PpNativeSipStatus,
} from "@/lib/planipret/sip/nativePpSipService";
import { addDedupedCapListener } from "@/lib/planipret/sip/capListeners";
import {
  upsertRingingSession,
  claimCall,
  endSession,
  subscribeToCall,
  type CallSessionRow,
  type AnsweredBy,
} from "@/lib/planipret/calls/callSessionSync";
import { maestroTelecom } from "@/lib/planipret/maestroTelecom";

// Fire-and-forget Maestro logging — never blocks the call flow.
const maestroLog = (fn: () => Promise<unknown>) => {
  fn().catch((e) => console.warn("[maestro-telecom]", (e as Error)?.message ?? e));
};

// Last VoIP token pushed to the backend — used to detect rotations (restore,
// reinstall, APNs re-issue) and re-arm the SIP registration when it changes.
let lastVoipToken: string | null = null;

async function uploadPlanipretVoipToken(token: string, bundleId?: string, extension?: string | null, environment?: string) {
  if (!token) return;
  const firstSeen = lastVoipToken === null;
  const changed = lastVoipToken !== null && lastVoipToken !== token;
  if (changed) console.info("[pp-voip] VoIP token changed → re-registering SIP", { suffix: token.slice(-6) });
  else if (lastVoipToken === null) console.info("[pp-voip] VoIP token registered", { suffix: token.slice(-6) });
  lastVoipToken = token;
  try {
    const { error } = await supabase.functions.invoke("pp-voip-push-token", {
      body: {
        deviceToken: token,
        platform: "ios",
        bundleId,
        extension: extension ?? (ppSipProvider.getConfig?.() as any)?.extension ?? null,
        environment: environment || undefined,
      },
    });
    if (error) console.warn("[pp-voip] token upload failed", error);
    else if (changed || firstSeen) {
      try { ppSipProvider.forceReregister(); } catch {}
    }
  } catch (e) { console.warn("[pp-voip] token upload failed", e); }
}

let softphoneOwnerId: string | null = null;
let softphoneOwnerUserId: string | null = null;
let softphoneOwnerSeq = 0;
let globalSipInitInFlight = false;
let lastSipInitStartedAt = 0;

function acquireSipInitLock(minGapMs = 2500): boolean {
  const now = Date.now();
  if (globalSipInitInFlight) return false;
  if (now - lastSipInitStartedAt < minGapMs) return false;
  globalSipInitInFlight = true;
  lastSipInitStartedAt = now;
  return true;
}

function releaseSipInitLock() {
  globalSipInitInFlight = false;
}

function acquireSoftphoneOwner(instanceId: string, userId: string): boolean {
  if (!softphoneOwnerId || softphoneOwnerId === instanceId || softphoneOwnerUserId !== userId) {
    softphoneOwnerId = instanceId;
    softphoneOwnerUserId = userId;
    return true;
  }
  return false;
}

function releaseSoftphoneOwner(instanceId: string) {
  if (softphoneOwnerId === instanceId) {
    softphoneOwnerId = null;
    softphoneOwnerUserId = null;
  }
}




let gumProxyInstalled = false;
let gumOriginal: typeof navigator.mediaDevices.getUserMedia | null = null;

function readNCMode(): NCMode {
  try { return (localStorage.getItem("pp_nc_mode") as NCMode) || "standard"; }
  catch { return "standard"; }
}
function readNCEnabled(): boolean {
  try { const v = localStorage.getItem("pp_nc_enabled"); return v === null ? true : v === "1"; }
  catch { return true; }
}

/** Install a one-time getUserMedia proxy that upgrades audio-only requests with
 *  the Planipret NC constraints. Idempotent and safe to call multiple times. */
function ensureGumProxy() {
  if (gumProxyInstalled || typeof navigator === "undefined") return;
  const md: any = navigator.mediaDevices;
  if (!md?.getUserMedia) return;
  gumOriginal = md.getUserMedia.bind(md);
  md.getUserMedia = async (constraints: MediaStreamConstraints) => {
    try {
      const wantsAudioOnly = constraints && constraints.audio && !constraints.video;
      if (wantsAudioOnly && readNCEnabled()) {
        const cfg = getAudioConstraints(readNCMode());
        const merged: MediaStreamConstraints = {
          audio: { ...(typeof constraints.audio === "object" ? constraints.audio : {}), ...(cfg.audio as any) },
          video: false,
        };
        return await gumOriginal!(merged);
      }
    } catch { /* fall through */ }
    return gumOriginal!(constraints);
  };
  gumProxyInstalled = true;
}

export type OutboundResult =
  | { via: "webrtc"; ok: true }
  | { via: "pbx"; ok: true; callId?: string }
  | { via: "none"; ok: false; error: string; micState?: MicPermissionState };

type RestCallAttachment = {
  id: string;
  direction?: "in" | "out";
  other?: string;
  number?: string;
  status?: PpSipSnapshot["callState"] | string;
  startedAt?: number;
};

export function useMplanipretSoftphone(enabled = true) {
  const { user } = useAuth();
  const ownerIdRef = useRef<string>(`pp-softphone-${++softphoneOwnerSeq}`);
  const [snap, setSnap] = useState<PpSipSnapshot>(() => ppSipProvider.getSnapshot());
  const [loading, setLoading] = useState(false);
  const [net, setNet] = useState<NetSample>(networkMonitor.current());
  const [quality, setQuality] = useState<CallQualitySnapshot | null>(null);
  const [brokerId, setBrokerId] = useState<string | null>(null);
  const [answeredElsewhere, setAnsweredElsewhere] = useState<AnsweredBy | null>(null);
  const [restCall, setRestCall] = useState<RestCallAttachment | null>(null);
  const [nativeStatus, setNativeStatus] = useState<PpNativeSipStatus | null>(null);
  const seenCallIds = useRef<Set<string>>(new Set());
  const mobileSipConfigRef = useRef<PpSipConfig | null>(null);
  /** True when the `<ext>_web` device is unavailable → JsSIP is the only owner. */
  const sameAorRef = useRef<boolean>(false);

  // Subscribe to the SIP snapshot.
  useEffect(() => ppSipProvider.subscribe(setSnap), []);

  // 24h SIP stability soak recorder (rolling window in localStorage).
  useEffect(() => startSipStabilityMonitor(), []);

  // Boot audio proxy + network monitor + handover once.
  useEffect(() => {
    ensureGumProxy();
    handoverController.start();
    const un = networkMonitor.subscribe(setNet);
    return () => { un(); };
  }, []);

  // Load broker id (planipret_profiles.id) once.
  useEffect(() => {
    if (!enabled || !user) { setBrokerId(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("planipret_profiles")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!cancelled) setBrokerId((data?.id as string) ?? null);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [enabled, user?.id]);

  // Resolve NS-API SIP credentials and register the softphone per user.
  // Re-runs whenever the ExtensionSync page dispatches `pp:sip-ready`, so a
  // freshly-created `{ext}_mobile` device actually REGISTERs and shows up in
  // NetSapiens with IP/User-Agent instead of empty columns.
  useEffect(() => {
    if (!enabled || !user) { setLoading(false); return; }
    const ownerId = ownerIdRef.current;
    if (!acquireSoftphoneOwner(ownerId, user.id)) { setLoading(false); return; }
    let cancelled = false;
    const doInit = async (opts?: { force?: boolean }) => {
      if (!acquireSipInitLock(opts?.force ? 0 : 2500)) return;
      setLoading(true);
      try {
        if (opts?.force) {
          try { ppSipProvider.stop(); } catch {}
        }
        const { data, error } = await supabase.functions.invoke("ns-resolve-sip-credentials", { body: { client_type: "mobile" } });
        if (cancelled) return;
        if (error || !data || (data as any)?.error) return;
        const d = data as any;
        const wssUrl = String(d.sip_wss_url ?? d.sip_ws_url ?? "").trim();
        const wssUrls = Array.isArray(d.sip_wss_urls)
          ? d.sip_wss_urls
          : Array.isArray(d.sip_ws_urls)
            ? d.sip_ws_urls
            : undefined;
        if (!wssUrl || !/^wss?:\/\//i.test(wssUrl)) {
          console.error("[softphone] invalid SIP WSS URL", { wssUrl, device_id: d.device_id });
          return;
        }
        const sipConfig: PpSipConfig = {
          extension: String(d.sip_extension),
          sipUsername: String(d.sip_username || d.sip_extension),
          sipDomain: String(d.sip_domain),
          sipProxy: d.sip_proxy,
          wssUrl,
          wssUrls,
          password: String(d.sip_password),
          displayName: String(d.display_name || d.sip_display_name || d.sip_extension),
        };
        mobileSipConfigRef.current = sipConfig;
        // The native keep-alive service owns the `<ext>_mobile` device, but ONLY
        // in background. Running it while the WebView (JsSIP) is registered makes
        // NetSapiens close the sockets alternately (code 1001 loop, hundreds of
        // sockets). In foreground the JS provider is the single owner.
        const appIsForeground = typeof document === "undefined" || document.visibilityState !== "hidden";
        if (appIsForeground) {
          await stopPlanipretSipKeepAlive().catch(() => undefined);
        } else {
          startPlanipretSipKeepAlive(sipConfig).then((s) => { if (s && !cancelled) setNativeStatus(s); }).catch(() => undefined);
        }


        let webConfig: PpSipConfig = sipConfig;
        try {
          const webRes = await supabase.functions.invoke("ns-resolve-sip-credentials", { body: { client_type: "web" } });
          const w = webRes.data as any;
          if (!webRes.error && w && !w.error && w.sip_username && w.sip_password) {
            const webWss = String(w.sip_wss_url ?? w.sip_ws_url ?? wssUrl).trim();
            webConfig = {
              ...sipConfig,
              sipUsername: String(w.sip_username),
              password: String(w.sip_password),
              sipDomain: String(w.sip_domain || sipConfig.sipDomain),
              wssUrl: /^wss?:\/\//i.test(webWss) ? webWss : wssUrl,
              wssUrls: Array.isArray(w.sip_wss_urls) ? w.sip_wss_urls : wssUrls,
            };
          } else {
            console.warn("[softphone] web device unavailable, falling back to mobile device for JsSIP");
          }
        } catch {
          console.warn("[softphone] web credential lookup failed, using mobile device");
        }
        // If the `<ext>_web` device could not be resolved, JsSIP and the native
        // keep-alive would share the SAME AOR. NetSapiens then closes the WSS
        // sockets alternately (code 1001 loop). In that case the WebView stays
        // the only SIP owner and the native service must never be started.
        sameAorRef.current = webConfig.sipUsername === sipConfig.sipUsername;
        if (sameAorRef.current) {
          console.warn("[softphone] single-AOR mode: native keep-alive disabled to avoid WSS 1001 loop");
          await stopPlanipretSipKeepAlive().catch(() => undefined);
        }
        if (cancelled) return;
        await ppSipProvider.init(webConfig);
        void getPlanipretVoipPushToken().then((t) => {
          if (t?.token) void uploadPlanipretVoipToken(t.token, t.bundleId, sipConfig.extension, t.environment);
        });
        // Broadcast our registered device id so any UI can highlight it.
        try {
          window.dispatchEvent(new CustomEvent("pp:sip-registered", {
            detail: { registered: true, deviceId: d.device_id },
          }));
        } catch {}
      } finally {
        releaseSipInitLock();
        if (!cancelled) setLoading(false);
      }
    };
    void doInit();
    const onReady = (e: any) => { void doInit({ force: !!e?.detail?.force }); };
    const onForce = (e: any) => {
      if (e?.detail?.force === true) { void doInit({ force: true }); return; }
      try { ppSipProvider.forceReregister(); } catch {}
    };
    window.addEventListener("pp:sip-ready", onReady as any);
    window.addEventListener("pp:sip-force-reregister", onForce as any);
    return () => {
      cancelled = true;
      window.removeEventListener("pp:sip-ready", onReady as any);
      window.removeEventListener("pp:sip-force-reregister", onForce as any);
      releaseSoftphoneOwner(ownerId);
    };
  }, [enabled, user?.id]);

  // Native guard: Android keeps a foreground keep-alive service with WakeLock / WifiLock;
  // iOS receives native background refresh requests and re-registers as soon as execution resumes.
  useEffect(() => {
    if (!enabled || !user) return;
    if (softphoneOwnerId !== ownerIdRef.current) return;
    let cleanupStatus: (() => void) | undefined;
    let cleanupReregister: (() => void) | undefined;
    let cancelled = false;
    onPlanipretSipKeepAliveStatus((s) => { if (!cancelled) setNativeStatus(s); })
      .then((fn) => { cleanupStatus = fn; })
      .catch(() => undefined);
    onPlanipretNativeReregister(() => {
      try { ppSipProvider.forceReregister(); } catch {}
    }).then((fn) => { cleanupReregister = fn; }).catch(() => undefined);

    // Native incoming INVITE (background/lockscreen). Wake JsSIP + broadcast so
    // MActiveCall / MHome can pop the ringing sheet even if the WebView slept.
    let cleanupInvite: (() => void) | undefined;
    onPlanipretIncomingInvite((invite) => {
      try { ppSipProvider.forceReregister(); } catch {}
      try {
        window.dispatchEvent(new CustomEvent("pp:sip-incoming-invite", { detail: invite }));
      } catch {}
      // If the user already tapped Answer on the notification, mark the intent
      // so the softphone auto-answers the JsSIP-side INVITE as soon as it lands.
      if (invite?.action === "answer") {
        try { (window as any).__ppPendingAnswer = { callId: invite.callId, ts: Date.now() }; } catch {}
      } else if (invite?.action === "decline") {
        try { ppSipProvider.hangup(); } catch {}
        void acknowledgePlanipretIncoming();
      }
    }).then((fn) => { cleanupInvite = fn; }).catch(() => undefined);



    // iOS PushKit + CallKit: forward device token to the backend, and bridge
    // the native answer/reject actions to the JsSIP session.
    let cleanupVoipToken: (() => void) | undefined;
    let cleanupVoipAnswer: (() => void) | undefined;
    let cleanupVoipReject: (() => void) | undefined;
    let cleanupVoipInvalid: (() => void) | undefined;
    onPlanipretVoipPushToken(({ token, bundleId, environment, source }) => {
      if (!token) { console.warn("[pp-voip] empty VoIP token received", { source }); return; }
      void uploadPlanipretVoipToken(token, bundleId, null, environment);
    }).then((fn) => { cleanupVoipToken = fn; }).catch(() => undefined);

    onPlanipretVoipPushTokenInvalidated(() => {
      console.warn("[pp-voip] VoIP token invalidated by iOS → requesting a new one");
      lastVoipToken = null;
      void refreshPlanipretVoipPushToken();
    }).then((fn) => { cleanupVoipInvalid = fn; }).catch(() => undefined);

    // Verify the token on mount and every time the app comes back to the
    // foreground; regenerate it when iOS returns nothing.
    const verifyVoipToken = () => {
      void getPlanipretVoipPushToken().then((t) => {
        if (t?.token) void uploadPlanipretVoipToken(t.token, t.bundleId, null, t.environment);
        else { console.warn("[pp-voip] no VoIP token available → refreshing PushKit"); void refreshPlanipretVoipPushToken(); }
      });
    };
    verifyVoipToken();
    const onVisibleVoip = () => { if (document.visibilityState === "visible") verifyVoipToken(); };
    document.addEventListener("visibilitychange", onVisibleVoip);
    const voipRecheck = window.setInterval(verifyVoipToken, getPpSipReconnectConfig().voipTokenCheckMs);

    // PushKit is the only reliable iOS background wake: as soon as the VoIP push
    // creates the CallKit call, force the native keep-alive to re-REGISTER (the
    // WSS socket is usually dead after suspension) instead of waiting on it.
    let cleanupVoipIncoming: (() => void) | undefined;
    onPlanipretVoipIncomingCall((data) => {
      console.log("[pp-voip] incoming VoIP push → waking native SIP", data?.callId);
      void wakePlanipretNativeSipForIncomingCall("voip_push");
      try { ppSipProvider.forceReregister(); } catch {}
      try { (window as any).__ppPendingAnswer = { callId: data?.callId, ts: Date.now() }; } catch {}
    }).then((fn) => { cleanupVoipIncoming = fn; }).catch(() => undefined);

    onPlanipretIncomingCallAnswered((data) => {
      try { (window as any).__ppPendingAnswer = { callId: data?.callId, ts: Date.now() }; } catch {}
      try { ppSipProvider.forceReregister(); } catch {}
      try { ppSipProvider.answer(); } catch {}
      try { window.dispatchEvent(new CustomEvent("pp:sip-callkit-answered", { detail: data })); } catch {}
    }).then((fn) => { cleanupVoipAnswer = fn; }).catch(() => undefined);

    onPlanipretIncomingCallRejected((data) => {
      try { ppSipProvider.hangup(); } catch {}
      void acknowledgePlanipretIncoming();
      try { window.dispatchEvent(new CustomEvent("pp:sip-callkit-rejected", { detail: data })); } catch {}
    }).then((fn) => { cleanupVoipReject = fn; }).catch(() => undefined);

    const poll = window.setInterval(() => {
      getPlanipretSipKeepAliveStatus().then((s) => { if (s && !cancelled) setNativeStatus(s); }).catch(() => undefined);
    }, 15_000);
    void getPlanipretSipKeepAliveStatus().then((s) => { if (s && !cancelled) setNativeStatus(s); });
    void requestPlanipretBatteryOptimizationExemption();
    return () => {
      cancelled = true;
      window.clearInterval(poll);
      cleanupStatus?.();
      cleanupReregister?.();
      cleanupInvite?.();
      document.removeEventListener("visibilitychange", onVisibleVoip);
      window.clearInterval(voipRecheck);
      cleanupVoipToken?.();
      cleanupVoipInvalid?.();
      cleanupVoipIncoming?.();
      cleanupVoipAnswer?.();
      cleanupVoipReject?.();
    };
  }, [enabled, user?.id]);

  // Watchdog: keep the SIP registration alive. If we drift into
  // `disconnected` / `error` for more than 10s, force a re-REGISTER. If still
  // KO after 20s, ask the boot flow to re-init credentials from scratch. Also
  // trigger an immediate re-register on visibility/online/focus resume so the
  // user never sees "Offline" while a call is ringing.
  useEffect(() => {
    if (!enabled || !user) return;
    if (softphoneOwnerId !== ownerIdRef.current) return;
    let softTimer: ReturnType<typeof setTimeout> | null = null;
    let hardTimer: ReturnType<typeof setTimeout> | null = null;
    let nativeStopTimer: ReturnType<typeof setTimeout> | null = null;
    let lastWatchdogAt = 0;
    let lastResumeAt = 0;
    const clearTimers = () => {
      if (softTimer) { clearTimeout(softTimer); softTimer = null; }
      if (hardTimer) { clearTimeout(hardTimer); hardTimer = null; }
    };
    const evaluate = () => {
      const st = ppSipProvider.getSnapshot().status;
      if (st === "registered" || st === "connected") {
        lastWatchdogAt = 0;
        clearTimers();
        return;
      }
      // Give the initial WebSocket + REGISTER handshake room to finish. Killing
      // the UA while it is still "connecting" was the cause of the endless
      // "registration failed: Connection Error" loop.
      if (st === "connecting") return;
      if (Date.now() - lastWatchdogAt < 20_000) return;
      lastWatchdogAt = Date.now();
      clearTimers();
      softTimer = setTimeout(() => {
        const s = ppSipProvider.getSnapshot().status;
        if (s !== "registered" && s !== "connected") {
          try { ppSipProvider.forceReregister(); } catch {}
        }
      }, 15_000);
      hardTimer = setTimeout(() => {
        const s = ppSipProvider.getSnapshot().status;
        if (s !== "registered" && s !== "connected") {
          try { ppSipProvider.forceReregister(); } catch {}
        }
      }, 45_000);
    };
    // Background handoff: hand the registration to the native keep-alive service
    // and retry a few times — a single failed start was leaving the extension
    // unregistered as soon as the app left the foreground.
    let handoffSeq = 0;
    /** True once the native keep-alive really took the registration over. */
    let handedOffToNative = false;
    let handoffTimer: ReturnType<typeof setTimeout> | null = null;
    const cancelPendingHandoff = () => {
      if (handoffTimer) { clearTimeout(handoffTimer); handoffTimer = null; }
      handoffSeq++; // invalidate any in-flight handoff
    };
    /** iOS emits transient `isActive:false` (permission sheets, CallKit, push
     *  prompts). Handing off instantly on each blip started/stopped the native
     *  SIP stack every second and produced the NetSapiens WSS 1001 loop.
     *  Only hand off once the app has really stayed in background. */
    const scheduleHandoff = (delay = 2500) => {
      if (sameAorRef.current) return;
      if (handoffTimer) clearTimeout(handoffTimer);
      handoffTimer = setTimeout(() => {
        handoffTimer = null;
        const stillHidden = typeof document === "undefined" || document.visibilityState === "hidden";
        if (!stillHidden) return;
        void handoffToNative();
      }, delay);
    };
    const handoffToNative = async () => {
      // Native must always own the dedicated `<ext>_mobile` AOR in background.
      // `ppSipProvider.getConfig()` is intentionally the foreground `<ext>_web`
      // config, so using it here makes native + JsSIP fight over the same AOR
      // on resume and recreates the NetSapiens 1001 disconnect loop.
      if (sameAorRef.current) { try { ppSipProvider.forceReregister(); } catch {} return; }
      const cfg = mobileSipConfigRef.current ?? ppSipProvider.getConfig();
      if (!cfg) return;
      const seq = ++handoffSeq;
      // Wait for the native service to report a real PBX REGISTER 200 OK
      // ("registered"/"protected") before dropping the WebView contact. Any
      // earlier release leaves a window with zero registered AOR => voicemail.
      const waitForNativeRegistered = async (): Promise<boolean> => {
        for (let i = 0; i < 12; i++) {
          if (seq !== handoffSeq) return false;
          const st = await getPlanipretSipKeepAliveStatus().catch(() => null);
          if (st) setNativeStatus(st);
          const v = String(st?.status ?? "");
          // Only a real PBX 200 OK counts. "protected" alone just means the
          // background task is held, so require loggedIn on that path.
          if (v === "registered") return true;
          if (v === "protected" && st?.loggedIn === true) return true;
          if (v === "error") return false;
          await new Promise((r) => setTimeout(r, 1_000));
        }
        return false;
      };
      for (let attempt = 0; attempt < 3; attempt++) {
        if (seq !== handoffSeq) return;
        try {
          const s = await startPlanipretSipKeepAlive(cfg);
          if (s) setNativeStatus(s);
          const st = String(s?.status ?? "");
          if (s?.ok !== false && st !== "error") {
            const confirmed = await waitForNativeRegistered();
            if (seq !== handoffSeq) return;
            if (confirmed) {
              // Native owns a confirmed registration — now it is safe to drop
              // the WebView contact so NetSapiens stops forking inbound calls
              // to a suspended WebSocket.
              try { await ppSipProvider.releaseForBackground(); } catch { /* noop */ }
              handedOffToNative = true;
              return;
            }
          }
        } catch { /* retry */ }
        await new Promise((r) => setTimeout(r, 2_000 * (attempt + 1)));
      }
      // Native keep-alive never confirmed a 200 OK: keep the WebView
      // registration alive instead of leaving the extension unregistered,
      // otherwise every inbound call drops to voicemail.
      try { ppSipProvider.forceReregister(); } catch { /* noop */ }
    };
    const stopNativeAfterWebRegistered = (force = false) => {
      // NetSapiens keeps ONE registration per AOR (doc: registrations.md).
      // Never drop the native registration before JsSIP has a confirmed
      // REGISTER 200 OK: the gap between the two stacks is exactly what makes
      // an inbound call hit voicemail and only ring the app afterwards.
      if (nativeStopTimer) clearTimeout(nativeStopTimer);
      let tries = 0;
      const tick = () => {
        nativeStopTimer = null;
        if (!force && typeof document !== "undefined" && document.visibilityState === "hidden") return;
        if (ppSipProvider.getSnapshot().status === "registered") {
          void stopPlanipretSipKeepAlive().catch(() => undefined);
          return;
        }
        if (tries++ >= 20) return; // keep native registered — safest state
        nativeStopTimer = setTimeout(tick, 1_000);
      };
      tick();
    };

    const un = ppSipProvider.subscribe(() => evaluate());
    /**
     * Resume with hysteresis. iOS fires transient `isActive:false/true` pairs
     * (permission sheets, CallKit, control center). Re-`init()`-ing JsSIP on
     * each of them tore down a healthy WSS socket and produced the stop/start
     * loop. We only rebuild the UA when the stack is actually broken or when
     * the native keep-alive really took ownership in background.
     */
    const resumeSip = () => {
      const now = Date.now();
      if (now - lastResumeAt < 4000) return;
      lastResumeAt = now;
      try {
        const status = ppSipProvider.getSnapshot().status;
        const healthy = status === "registered" && !handedOffToNative;
        if (healthy) {
          // Nothing to rebuild — just make sure native isn't holding the AOR.
          stopNativeAfterWebRegistered(true);
          evaluate();
          return;
        }
        const cfg = ppSipProvider.getConfig();
        if (cfg) {
          // Do NOT stop native here: JsSIP is not registered yet.
          if (!acquireSipInitLock(4000)) return;
          void ppSipProvider.init(cfg).finally(() => {
            handedOffToNative = false;
            releaseSipInitLock();
            stopNativeAfterWebRegistered(true);
          });
        } else {
          ppSipProvider.forceReregister();
          handedOffToNative = false;
          stopNativeAfterWebRegistered(true);
        }
      } catch { /* noop */ }
      evaluate();
    };
    const onResume = () => resumeSip();
    const onVis = () => { if (document.visibilityState === "visible") { cancelPendingHandoff(); onResume(); } else scheduleHandoff(); };
    document.addEventListener("visibilitychange", onVis);
    const onBackgrounded = () => { scheduleHandoff(); };
    window.addEventListener("pagehide", onBackgrounded);
    window.addEventListener("freeze", onBackgrounded as EventListener);

    window.addEventListener("focus", onResume);
    window.addEventListener("online", onResume);
    // Native app foreground → immediately re-REGISTER before the 10s watchdog.
    // Registered through the dedup registry: a second mount must NOT create a
    // second native subscription (that fired init/reconnect twice).
    let removeAppStateListener: () => void = () => undefined;
    const cap: any = (typeof window !== "undefined") ? (window as any).Capacitor : null;
    const isNative = !!cap?.isNativePlatform?.();
    if (isNative) {
      try {
        removeAppStateListener = addDedupedCapListener("App", cap?.Plugins?.App, "appStateChange", (state: { isActive: boolean }) => {
          if (state?.isActive) {
            // Cancel any pending background handoff first: iOS fires transient
            // isActive:false blips and a late handoff would restart the native
            // stack while JsSIP is registered (WSS 1001 loop).
            cancelPendingHandoff();
            resumeSip();
          } else {
            scheduleHandoff();
          }
        });
      } catch { /* ignore */ }
    }

    // Heartbeat: SIP transport can go silent without emitting a status event
    // (background tab, radio switch, NS keepalive drop). Poll every 15s so the
    // watchdog escalates to forceReregister even without a subscribe callback.
    const heartbeat = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        scheduleHandoff();
        return;
      }
      evaluate();
    }, 15_000);
    // Initial evaluation — don't wait for the first SIP event.
    evaluate();
    return () => {
      un();
      clearTimers();
      cancelPendingHandoff();
      if (nativeStopTimer) clearTimeout(nativeStopTimer);
      window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onResume);
      window.removeEventListener("online", onResume);
      window.removeEventListener("pagehide", onBackgrounded);
      window.removeEventListener("freeze", onBackgrounded as EventListener);
      try { removeAppStateListener(); } catch {}
    };

  }, [enabled, user?.id]);


  // Live call quality only while a call is active.
  useEffect(() => {
    const active = snap.callState === "active" || snap.callState === "held";
    if (!active) { setQuality(null); return; }
    const un = callQualitySampler.subscribe(setQuality);
    return () => { un(); };
  }, [snap.callState]);

  // Cross-device call session sync (mobile ↔ widget via SIP Call-ID).
  useEffect(() => {
    const callId = snap.callId;
    if (!callId || !brokerId) return;
    const ringing = snap.callState === "ringing-in" || snap.callState === "ringing-out";
    if (!ringing) return;
    if (seenCallIds.current.has(callId)) return;
    seenCallIds.current.add(callId);
    setAnsweredElsewhere(null);
    void upsertRingingSession({
      callId,
      brokerId,
      direction: snap.direction === "in" ? "inbound" : "outbound",
      remoteNumber: snap.remoteNumber || undefined,
    });
    const unsub = subscribeToCall(callId, (row: CallSessionRow) => {
      // Another device answered while we were still ringing — dismiss locally.
      if (row.state === "active" && row.answered_by && row.answered_by !== "mobile") {
        setAnsweredElsewhere(row.answered_by);
        try { ppSipProvider.hangup(); } catch {}
      }
    });
    return () => { unsub(); };
  }, [snap.callId, snap.callState, snap.direction, snap.remoteNumber, brokerId]);

  // Mark session ended when local call ends.
  useEffect(() => {
    if (snap.callState !== "ended" || !snap.callId) return;
    void endSession(snap.callId, snap.errorCause || "hangup");
  }, [snap.callState, snap.callId, snap.errorCause]);

  const registered = snap.status === "registered";

  const normalizeRestState = useCallback((state?: string): PpSipSnapshot["callState"] => {
    const s = String(state ?? "active").toLowerCase();
    if (s.includes("ring") && (s.includes("out") || restCall?.direction === "out")) return "ringing-out";
    if (s.includes("ring") || s === "inbound") return "ringing-in";
    if (s.includes("hold")) return "held";
    if (["ended", "completed", "cancelled", "failed", "no_answer", "disconnected"].some((x) => s.includes(x))) return "ended";
    return "active";
  }, [restCall?.direction]);

  // When the app is backgrounded, the WebView SIP contact is intentionally
  // released and the native keep-alive service owns the registration. Without
  // this merge the UI reported "disconnected" even though the extension is
  // still registered on the PBX (native contact alive).
  const nativeOwnsRegistration = useMemo(() => {
    const st = String((nativeStatus as any)?.status ?? "");
    return (nativeStatus as any)?.ok !== false && (st === "registered" || st === "protected");
  }, [nativeStatus]);

  const effectiveSnap = useMemo<PpSipSnapshot>(() => {
    const base: PpSipSnapshot = (nativeOwnsRegistration && snap.status !== "registered" && snap.status !== "connected")
      ? ({ ...snap, status: "registered", lastError: null } as PpSipSnapshot)
      : snap;
    if (!restCall?.id) return base;
    const state = normalizeRestState(restCall.status);
    return {
      ...base,
      callState: state,
      callId: restCall.id,
      remoteIdentity: restCall.other || restCall.number || "—",
      remoteNumber: restCall.number || restCall.other || "",
      direction: restCall.direction ?? null,
      startedAt: restCall.startedAt ?? base.startedAt ?? Date.now(),
      onHold: state === "held",
    };
  }, [snap, restCall, normalizeRestState, nativeOwnsRegistration]);

  const restControl = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    const id = restCall?.id;
    if (!id) return false;
    const { error } = await supabase.functions.invoke("pp-ns-calls", { body: { action, call_id: id, ...extra } });
    if (error) return false;
    if (action === "disconnect" || action === "reject") {
      setRestCall((cur) => cur?.id === id ? { ...cur, status: "ended" } : cur);
      window.setTimeout(() => setRestCall((cur) => cur?.id === id ? null : cur), 1200);
    } else if (action === "answer") {
      setRestCall((cur) => cur?.id === id ? { ...cur, status: "active", startedAt: Date.now() } : cur);
    } else if (action === "hold") {
      setRestCall((cur) => cur?.id === id ? { ...cur, status: "held" } : cur);
    } else if (action === "unhold" || action === "resume") {
      setRestCall((cur) => cur?.id === id ? { ...cur, status: "active" } : cur);
    }
    return true;
  }, [restCall?.id]);

  const callViaPBX = useCallback(async (destination: string): Promise<OutboundResult> => {
    const { data, error } = await supabase.functions.invoke("pp-ns-calls", { body: { action: "start", to_number: destination, client_type: "mobile" } });
    if (error || (data as any)?.success === false) {
      const msg = (data as any)?.message ?? (data as any)?.error ?? error?.message ?? "PBX call failed";
      return { via: "none", ok: false, error: msg };
    }
    const callId = String((data as any)?.call_id ?? "");
    if (callId) {
      setRestCall({
        id: callId,
        direction: "out",
        other: destination,
        number: destination,
        status: "ringing-out",
        startedAt: Date.now(),
      });
      maestroLog(() => maestroTelecom.createCall({
        provider_call_id: callId,
        to_user_number: destination,
        status: "dialing",
        direction: "outbound",
      }));
    }
    return { via: "pbx", ok: true, callId };
  }, []);


  const placeCall = useCallback(async (destination: string): Promise<OutboundResult> => {
    if (!destination) return { via: "none", ok: false, error: "empty destination" };
    const mic = await ensureMicPermission();
    if (mic.state !== "granted") {
      try { mic.stream?.getTracks().forEach((tr) => tr.stop()); } catch {}
      return { via: "none", ok: false, error: mic.error ?? "microphone unavailable", micState: mic.state };
    }
    try { mic.stream?.getTracks().forEach((tr) => tr.stop()); } catch {}
    let canUseSip = registered;
    if (!canUseSip) {
      try { ppSipProvider.forceReregister(); } catch {}
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
      const st = ppSipProvider.getSnapshot().status;
      canUseSip = st === "registered" || st === "connected";
    }
    if (canUseSip) {
      try {
        await ppSipProvider.call(destination);
        return { via: "webrtc", ok: true };
      } catch (e: any) {
        console.warn("[softphone] WebRTC call failed, falling back to PBX", e?.message ?? e);
      }
    }
    return await callViaPBX(destination);
  }, [registered, callViaPBX]);

  // Wrapped answer: race to claim the call before actually picking up. If we
  // lose (widget answered first), don't pick up — the winner already has audio.
  const answer = useCallback(async () => {
    if (restCall?.id) return await restControl("answer");
    const callId = ppSipProvider.getSnapshot().callId;
    const won = await claimCall(callId, "mobile");
    if (!won) {
      setAnsweredElsewhere("widget");
      try { ppSipProvider.hangup(); } catch {}
      return false;
    }
    ppSipProvider.answer();
    return true;
  }, [restCall?.id, restControl]);

  const hangup = useCallback(() => {
    if (restCall?.id) {
      const id = restCall.id;
      void restControl("disconnect");
      maestroLog(() => maestroTelecom.updateCall(id, { status: "ended", ended_reason: "completed" }));
      return;
    }
    const callId = ppSipProvider.getSnapshot().callId;
    ppSipProvider.hangup();
    if (callId) {
      void endSession(callId, "hangup");
      maestroLog(() => maestroTelecom.updateCall(callId, { status: "ended", ended_reason: "completed" }));
    }
  }, [restCall?.id, restControl]);


  const attachRestCall = useCallback((attachment: RestCallAttachment | null) => {
    if (!attachment?.id) { setRestCall(null); return; }
    setRestCall({
      ...attachment,
      direction: attachment.direction ?? "out",
      status: attachment.status ?? "active",
      startedAt: attachment.startedAt ?? Date.now(),
    });
  }, []);

  const sipConnected = snap.status === "registered" || snap.status === "connected";

  return useMemo(() => ({
    snap: effectiveSnap,
    loading,
    net,
    quality,
    nativeStatus,
    sipConnected,
    placeCall,
    answeredElsewhere,
    dismissAnsweredElsewhere: () => setAnsweredElsewhere(null),
    attachRestCall,
    call: (n: string) => ppSipProvider.call(n),
    answer,
    hangup,
    reregister: () => { try { ppSipProvider.forceReregister(); } catch {} },
    mute: () => restCall?.id ? void restControl("mute", { muted: true }) : ppSipProvider.mute(),
    unmute: () => restCall?.id ? void restControl("mute", { muted: false }) : ppSipProvider.unmute(),
    hold: () => restCall?.id ? void restControl("hold") : ppSipProvider.hold(),
    unhold: () => restCall?.id ? void restControl("unhold") : ppSipProvider.unhold(),
    sendDTMF: (k: string) => restCall?.id ? void restControl("dtmf", { digit: k }) : ppSipProvider.sendDTMF(k),
    transfer: (t: string) => restCall?.id ? void restControl("transfer", { destination: t, target: t }) : ppSipProvider.transfer(t),
    setAudioEl: (el: HTMLAudioElement | null) => { ppSipProvider.audioEl = el; },
    forceHandover: () => handoverController.forceHandover(),
  }), [effectiveSnap, loading, net, quality, nativeStatus, sipConnected, placeCall, answer, hangup, answeredElsewhere, attachRestCall, restCall?.id, restControl]);

}
