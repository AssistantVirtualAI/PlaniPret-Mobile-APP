// Planipret mobile — softphone hook bound to the NS-API PBX.
import { edgeOnlyWssUrls } from "@/lib/planipret/sip/sipEdgePolicy";
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
  completePlanipretCallKitAnswer,
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
  setPlanipretNativeCallActive,
} from "@/lib/planipret/sip/nativePpSipService";
import { addDedupedCapListener } from "@/lib/planipret/sip/capListeners";
import { checkSipBackendRegistration } from "@/lib/planipret/sip/sipBackendCheck";

import {
  upsertRingingSession,
  claimCall,
  endSession,
  subscribeToCall,
  type CallSessionRow,
  type AnsweredBy,
} from "@/lib/planipret/calls/callSessionSync";
import { maestroTelecom } from "@/lib/planipret/maestroTelecom";
import { postOutboundCall, postInboundCall, updateCallIfPosted } from "@/lib/planipret/maestroCallPosting";

// Fire-and-forget Maestro logging — never blocks the call flow.
const maestroLog = (fn: () => Promise<unknown>) => {
  fn().catch((e) => console.warn("[maestro-telecom]", (e as Error)?.message ?? e));
};

// Last VoIP token pushed to the backend — used to detect rotations (restore,
// reinstall, APNs re-issue) and re-arm the SIP registration when it changes.
let lastVoipToken: string | null = null;
let voipTokenUpload: Promise<boolean> | null = null;
let voipTokenUploadKey = "";
let voipTokenRetry: ReturnType<typeof setTimeout> | null = null;
const VOIP_TOKEN_STORAGE_KEY = "pp.voip-token-confirmed.v1";

async function uploadPlanipretVoipToken(token: string, bundleId?: string, extension?: string | null, environment?: string) {
  if (!token) return;
  const key = `${token}|${bundleId ?? ""}|${extension ?? ""}|${environment ?? ""}`;
  try {
    if (localStorage.getItem(VOIP_TOKEN_STORAGE_KEY) === key) {
      lastVoipToken = token;
      return;
    }
  } catch { /* storage unavailable */ }
  if (voipTokenUpload && voipTokenUploadKey === key) {
    await voipTokenUpload;
    return;
  }
  voipTokenUploadKey = key;
  voipTokenUpload = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("pp-voip-push-token", {
        body: {
          deviceToken: token,
          platform: "ios",
          bundleId,
          extension: extension ?? ppSipProvider.getConfig()?.extension ?? null,
          environment: environment || undefined,
        },
      });
      if (error || (data as { ok?: boolean } | null)?.ok !== true) throw error ?? new Error("token_not_persisted");
      const changed = lastVoipToken !== null && lastVoipToken !== token;
      lastVoipToken = token;
      try { localStorage.setItem(VOIP_TOKEN_STORAGE_KEY, key); } catch { /* storage unavailable */ }
      if (voipTokenRetry) { clearTimeout(voipTokenRetry); voipTokenRetry = null; }
      console.info("[pp-voip] VoIP token confirmed", { changed, suffix: token.slice(-6) });
      return true;
    } catch (error) {
      console.warn("[pp-voip] token upload failed; retry scheduled", error);
      if (!voipTokenRetry) {
        voipTokenRetry = setTimeout(() => {
          voipTokenRetry = null;
          void uploadPlanipretVoipToken(token, bundleId, extension, environment);
        }, 15_000);
      }
      return false;
    } finally {
      if (voipTokenUploadKey === key) voipTokenUpload = null;
    }
  })();
  await voipTokenUpload;
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

/**
 * Ownership MUST belong to the instance that renders the call UI.
 *
 * `useMplanipretSoftphone(enabled = true)` defaults to true, and
 * `acquireSoftphoneOwner` is only reachable from the SIP init effect, which bails
 * out on `!enabled`. So at startup:
 *   - PlanipretMobile calls useMplanipretSoftphone(Boolean(profile?.user_id)) and
 *     is DISABLED on its first render (profile still loading) -> no acquire;
 *   - ActiveCallOverlay / MMore call useMplanipretSoftphone() with no argument,
 *     are enabled straight away, and WIN ownership;
 *   - once the profile lands, PlanipretMobile's acquire fails (already taken).
 *
 * The winner holds the CallKit answer listener and the cross-device claim yet
 * renders NOTHING - it only reads net/quality or sipConnected. Meanwhile
 * PpActiveCallScreen, which renders the keypad, is fed by PlanipretMobile whose
 * call effects are all gated off. That is exactly the reported symptom: Answer
 * does nothing and no call screen appears in the app.
 *
 * A `primary` instance therefore PREEMPTS a passive owner, and a passive instance
 * only takes ownership while no primary is mounted (so the softphone still works
 * on secondary screens).
 */
const softphonePrimaryIds = new Set<string>();

function isPrimaryOwner(): boolean {
  return softphoneOwnerId !== null && softphonePrimaryIds.has(softphoneOwnerId);
}

/**
 * Every mounted hook instance, so ownership can be HANDED OVER instead of simply
 * dropped.
 *
 * `PlanipretMobile`, `MMore` and `ActiveCallOverlay` all mount this hook, so
 * several instances coexist. Only the owner runs the call-critical effects (the
 * CallKit answer listener, the cross-device claim, the Maestro posting), but
 * `releaseSoftphoneOwner` used to clear the owner without waking anybody: since
 * `acquireSoftphoneOwner` is only reached from the SIP init effect, which depends
 * on [enabled, user?.id], ownership stayed VACANT until the user changed. From
 * that moment no instance listened for CallKit answers at all.
 */
const softphoneInstances = new Set<{ id: string; notify: () => void }>();

/** Notify every mounted instance that ownership is up for grabs. */
function notifySoftphoneInstances() {
  softphoneInstances.forEach((i) => { try { i.notify(); } catch { /* ignore */ } });
}

/**
 * A ringing or live call FREEZES ownership.
 *
 * Handing the owner role over mid-ring means the outgoing owner tears its effect
 * down (removing the CallKit answer listener) while the incoming one has not
 * mounted its own yet. A tap on "Answer" landing in that window is silently
 * dropped - the exact symptom we are chasing. Better a stale owner for a few
 * seconds than no listener at all.
 */
function softphoneCallIsLive(): boolean {
  try {
    const st = ppSipProvider.getSnapshot().callState;
    return ppSipProvider.hasActiveCall()
      || st === "ringing-in" || st === "ringing-out"
      || st === "active" || st === "held";
  } catch { return false; }
}

function releaseSoftphoneOwner(instanceId: string) {
  if (softphoneOwnerId !== instanceId) return;
  if (softphoneCallIsLive()) {
    console.info("[pp-sip] owner release deferred: call is live", { instanceId });
    return;
  }
  softphoneOwnerId = null;
  softphoneOwnerUserId = null;
  // Ownership must never stay vacant: the owner holds the CallKit answer
  // listener and the cross-device claim.
  notifySoftphoneInstances();
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

/**
 * @param enabled  gate the SIP stack (false while the profile is still loading).
 * @param opts.primary  set by the screens that RENDER the call UI
 *   (PlanipretMobile, PlanipretAdminLayout -> PpActiveCallScreen). A primary
 *   instance preempts a passive owner so the CallKit answer listener always lives
 *   in the instance whose `answer()` is wired to the visible keypad.
 */
export function useMplanipretSoftphone(enabled = true, opts?: { primary?: boolean; clientType?: "mobile" | "web" }) {
  const { user } = useAuth();
  const isPrimary = opts?.primary === true;
  // Which NetSapiens device this instance registers to: `<ext>M` for the iOS app,
  // `<ext>W` for the browser portal/widget. They have DIFFERENT passwords and must
  // never be mixed: two clients on one AOR make the SBC close the older WSS (1001).
  const clientType = opts?.clientType ?? "mobile";
  const ownerIdRef = useRef<string>(`pp-softphone-${++softphoneOwnerSeq}`);
  /** Bumped when ownership becomes available, so gated effects re-evaluate. */
  const [ownerTick, setOwnerTick] = useState(0);
  /** True while this instance is the single owner of the call-critical effects. */
  const isOwner = softphoneOwnerId === ownerIdRef.current;
  const [snap, setSnap] = useState<PpSipSnapshot>(() => ppSipProvider.getSnapshot());
  const [loading, setLoading] = useState(false);
  const [net, setNet] = useState<NetSample>(networkMonitor.current());
  const [quality, setQuality] = useState<CallQualitySnapshot | null>(null);
  const [brokerId, setBrokerId] = useState<string | null>(null);
  const [answeredElsewhere, setAnsweredElsewhere] = useState<AnsweredBy | null>(null);
  const [restCall, setRestCall] = useState<RestCallAttachment | null>(null);
  // Appel entrant annoncé par le push VoIP (CallKit) avant l'arrivée du INVITE.
  // Permet d'afficher immédiatement l'écran "ça sonne" avec Répondre/Raccrocher.
  const [pushRing, setPushRing] = useState<{ callId: string; from: string } | null>(null);
  const [nativeStatus, setNativeStatus] = useState<PpNativeSipStatus | null>(null);
  /** Latest answer() implementation, callable from native listeners registered once. */
  const answerRef = useRef<null | (() => Promise<boolean>)>(null);
  /** One answer transaction at a time across CallKit, notification and in-app UI. */
  const answerAttemptRef = useRef<Promise<boolean> | null>(null);
  /**
   * ring11 - last value pushed to the native setCallActive bridge, so we never
   * re-send an unchanged boolean (each redundant activation reconfigured the
   * AVAudioSession and cut the audio mid-call).
   */
  const lastNativeCallActiveRef = useRef<boolean | null>(null);

  const seenCallIds = useRef<Set<string>>(new Set());
  const mobileSipConfigRef = useRef<PpSipConfig | null>(null);
  /** Mobile WebView and native iOS stack deliberately share `<ext>M`, but never concurrently. */
  const sameAorRef = useRef<boolean>(false);

  // Subscribe to the SIP snapshot.
  useEffect(() => ppSipProvider.subscribe(setSnap), []);

  // Register this instance in the handover registry.
  useEffect(() => {
    const id = ownerIdRef.current;
    const entry = { id, notify: () => setOwnerTick((t) => t + 1) };
    softphoneInstances.add(entry);
    if (isPrimary) {
      softphonePrimaryIds.add(id);
      // A passive instance may already own the stack (it was enabled first): wake
      // everybody so the preemption below runs immediately.
      notifySoftphoneInstances();
    }
    return () => {
      softphoneInstances.delete(entry);
      softphonePrimaryIds.delete(id);
      // Releasing here (not only in the SIP init effect) guarantees the owner is
      // handed over even when the init effect never ran for this instance.
      releaseSoftphoneOwner(ownerIdRef.current);
      // A release refused because a call was live leaves an UNMOUNTED owner
      // behind. Wake the survivors so one of them can reclaim it once the call
      // is over, instead of staying orphaned until the user changes.
      if (softphoneOwnerId === ownerIdRef.current) notifySoftphoneInstances();
    };
  }, []);

  // Claim vacant ownership without tearing the SIP stack down.
  //
  // Deliberately a DEDICATED effect: adding `ownerTick` to the SIP init effect's
  // dependencies would run its cleanup (which calls releaseSoftphoneOwner ->
  // notify -> another tick) and re-init JsSIP on every handover, i.e. a
  // teardown/re-register cascade on top of the reconnect storm we are fixing.
  useEffect(() => {
    if (!enabled || !user) return;
    const myId = ownerIdRef.current;
    if (softphoneOwnerId === myId) return;                 // already ours
    // A passive instance never competes with a mounted primary one.
    if (!isPrimary && softphonePrimaryIds.size > 0 && !isPrimaryOwner()) {
      // A primary instance exists but has not claimed yet (profile still loading).
      // Stay out of the way instead of grabbing a role we cannot render.
      return;
    }
    const ownerAlive = softphoneOwnerId !== null
      && Array.from(softphoneInstances).some((i) => i.id === softphoneOwnerId);
    if (ownerAlive) {
      // PREEMPTION: the live owner is a passive instance and we render the call UI.
      // Never mid-ring: swapping the CallKit listener during a ring drops the tap.
      if (!(isPrimary && !isPrimaryOwner())) return;
      if (softphoneCallIsLive()) return;
      console.info("[pp-sip] preempting passive softphone owner", {
        from: softphoneOwnerId, to: myId,
      });
      softphoneOwnerId = null;
      softphoneOwnerUserId = null;
    } else if (softphoneOwnerId !== null) {
      // Orphaned owner (unmounted while a call was live). Reclaiming is only safe
      // once nothing is ringing, otherwise we recreate the very gap we avoid.
      if (softphoneCallIsLive()) return;
      console.info("[pp-sip] reclaiming orphaned softphone owner", { from: softphoneOwnerId });
      softphoneOwnerId = null;
      softphoneOwnerUserId = null;
    }
    if (!acquireSoftphoneOwner(myId, user.id)) return;
    console.info("[pp-sip] softphone owner acquired", { id: myId, primary: isPrimary });
    // Wake the others so the dispossessed instance re-renders without its gates.
    notifySoftphoneInstances();
    // Re-render so the gated effects below see `isOwner === true`.
    setOwnerTick((t) => t + 1);
  }, [enabled, user?.id, ownerTick, snap.callState, isPrimary]);

  // CallKit must only mark Answer fulfilled after the SIP dialog is confirmed;
  // otherwise iOS shows a connected call while NetSapiens is still ringing or
  // has already followed the voicemail branch.
  useEffect(() => {
    if (snap.callState === "active" && snap.direction === "in") {
      void completePlanipretCallKitAnswer(snap.callId, true);
    }
  }, [snap.callState, snap.direction, snap.callId]);

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
    // Ownership is arbitrated by the dedicated effect above (primary instances win),
    // NOT by whoever mounts first. Acquiring here as a fallback only, so a lone
    // instance still boots the stack.
    if (softphoneOwnerId !== ownerId
        && !acquireSoftphoneOwner(ownerId, user.id)) { setLoading(false); return; }
    let cancelled = false;
    const doInit = async (opts?: { force?: boolean }) => {
      if (!acquireSipInitLock(opts?.force ? 0 : 2500)) return;
      setLoading(true);
      try {
        if (opts?.force) {
          try { ppSipProvider.stop(); } catch {}
        }
        const { data, error } = await supabase.functions.invoke("ns-resolve-sip-credentials", { body: { client_type: clientType } });
        if (cancelled) return;
        if (error || !data || (data as any)?.error) return;
        const d = data as any;
        const rawWss = String(d.sip_wss_url ?? d.sip_ws_url ?? "").trim();
        const rawWssList = Array.isArray(d.sip_wss_urls)
          ? d.sip_wss_urls
          : Array.isArray(d.sip_ws_urls)
            ? d.sip_ws_urls
            : [];
        // NetSapiens requires the mobile AOR to register on one call-processing
        // core. edgeOnlyWssUrls pins that AOR to a single core (core1 by default).
        const wssUrls = edgeOnlyWssUrls([rawWss, ...rawWssList]);
        const wssUrl = wssUrls[0];
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
        // Always prime the native bridge with the resolved core host and SIP
        // credentials. In foreground startSipService only stores this config and
        // remains idle (`foreground_js_owns`); once iOS backgrounds the app it can
        // take ownership without failing with `missing_host`.
        // Native keep-alive only exists on the mobile client (`<ext>M`). The web
        // portal has no native bridge and must never start it.
        if (clientType === "mobile") {
          startPlanipretSipKeepAlive(sipConfig)
            .then((s) => { if (s && !cancelled) setNativeStatus(s); })
            .catch(() => undefined);
        }

        // In the mobile app, foreground JsSIP and the native background bridge share
        // the SAME `<ext>M` AOR, so handoff must be strictly sequential. On web there
        // is no native peer, hence no shared-AOR constraint.
        sameAorRef.current = clientType === "mobile";
        if (cancelled) return;
        await ppSipProvider.init(sipConfig);
        // VoIP push tokens belong to the iOS app only.
        if (clientType === "mobile") {
          void getPlanipretVoipPushToken().then((t) => {
            if (t?.token) void uploadPlanipretVoipToken(t.token, t.bundleId, sipConfig.extension, t.environment);
          });
        }
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
      // No-op unless we still own it: after a preemption the new owner must not be
      // wiped out by the dispossessed instance's cleanup.
      releaseSoftphoneOwner(ownerId);
    };
  }, [clientType, enabled, user?.id]);

  // Native guard: Android keeps a foreground keep-alive service with WakeLock / WifiLock;
  // iOS receives native background refresh requests and re-registers as soon as execution resumes.
  useEffect(() => {
    if (!enabled || !user) return;
    // Native keep-alive, PushKit and CallKit only exist in the iOS app (`<ext>M`).
    // The browser portal has no native bridge: registering these listeners there
    // would be a no-op at best, and would fight over the mobile AOR at worst.
    if (clientType !== "mobile") return;
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
      // If the user already tapped Answer on the notification, mark the intent
      // before re-registering, so a fast JsSIP INVITE cannot beat the flag.
      if (invite?.action === "answer") {
        try { (window as any).__ppPendingAnswer = { callId: invite.callId, ts: Date.now() }; } catch {}
        try { ppSipProvider.forceReregister(); } catch {}
        // Run the single arbitrated answer transaction. Calling requestAnswer()
        // here as well used to create a second 30s waiter racing CallKit/UI.
        void answerRef.current?.().then((ok) => console.info(`[pp-sip] notification answer → ${ok ? "connected" : "failed"}`));
      } else if (invite?.action === "decline") {
        try { ppSipProvider.requestDecline(invite?.callId); } catch {}
        void supabase.functions.invoke("pp-ns-calls", {
          body: { action: "reject", call_id: invite?.callId },
        }).catch(() => undefined);
        void acknowledgePlanipretIncoming();
      } else if (invite?.action === "cancelled") {
        try { ppSipProvider.hangup(); } catch {}
        setPushRing(null);
        void acknowledgePlanipretIncoming();
      } else {
        // No user action attached: the native keep-alive is reporting that IT
        // captured the INVITE on the shared `<ext>M` AOR. It has no WebRTC media
        // stack and its bridge forwards only callId/from - never the SDP offer - so
        // a call left in its hands can never be answered.
        //
        // Honest about the limit: NetSapiens will not re-offer an INVITE already
        // being answered on that AOR, so re-registering cannot rescue THIS call.
        // It restores a media-capable owner for the next one, and it is the signal
        // that ownership was on the wrong stack at INVITE time.
        console.warn("[pp-sip] native captured the INVITE (no media stack) → JsSIP reclaiming the <ext>M AOR", {
          callId: invite?.callId ?? "",
        });
        void ppSipProvider.wakeForIncoming(String(invite?.callId ?? ""));
      }
      try { ppSipProvider.forceReregister(); } catch {}
      try {
        window.dispatchEvent(new CustomEvent("pp:sip-incoming-invite", { detail: invite }));
      } catch {}
      /* clientType gate above keeps this mobile-only */
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
    onPlanipretVoipIncomingCall((data: any) => {
      const pushCallId = String(data?.callId ?? "");
      // ROOT CAUSE FIXED HERE - proven by the 3-inbound-call Xcode log:
      //   l.142  [pp-sip] incoming INVITE attached  (call 1 ONLY)
      //   l.153  JS SIP owns recovery      -> 200 OK sent + remote audio attached
      //   l.408  native SIP owns recovery  -> [answer] hasLiveSipSession:false
      //   l.539  native SIP owns recovery  -> [answer] hasLiveSipSession:false
      //
      // Both stacks share the SAME NetSapiens device `<ext>M`
      // (ns-resolve-sip-credentials is called with `client_type: "mobile"` and the
      // resulting config feeds both ppSipProvider.init and the native keep-alive),
      // so there is exactly ONE AOR and exactly one owner at a time. Starting both
      // in parallel makes NetSapiens close the sockets alternately (WSS 1001 loop).
      //
      // The bug was WHICH stack got picked. Ownership used to be arbitrated on
      // `document.visibilityState`, but a VoIP push arrives with the app
      // backgrounded or the screen locked BY DEFINITION, so the branch taken was
      // almost always `native`. PpSipKeepAlive holds the REGISTER so the phone
      // rings, but it has NO WebRTC media stack and its bridge forwards only
      // callId/from - never the SDP offer. Once it captures the INVITE the call is
      // structurally unanswerable: JS never sees `incoming INVITE attached` and
      // Answer lands on a dead session (`hasLiveSipSession:false`).
      //
      // The WebView is demonstrably ALIVE here - it is running this very handler -
      // and visibility measures UI state, not the ability to negotiate media. So
      // JsSIP, the only media-capable stack, takes the AOR; native stays a fallback.
      console.log("[pp-voip] incoming VoIP push → JsSIP takes the <ext>M AOR (media-capable owner)", {
        callId: pushCallId, visibility: document.visibilityState,
      });
      void ppSipProvider.wakeForIncoming(pushCallId).then((ok) => {
        if (ok) return;
        // JsSIP could not register in time: hand the AOR back to the keep-alive so
        // the phone at least rings rather than dropping to voicemail.
        console.warn("[pp-voip] JsSIP wake failed → falling back to native SIP ownership", { callId: pushCallId });
        void wakePlanipretNativeSipForIncomingCall("voip_push");
      }).catch(() => {
        void wakePlanipretNativeSipForIncomingCall("voip_push");
      });
      const from = String(data?.from ?? data?.handle ?? data?.caller ?? data?.callerName ?? "");
      setPushRing({ callId: String(data?.callId ?? ""), from });
      // Sécurité : si aucun INVITE n'arrive, on retire l'écran après 40 s.
      window.setTimeout(() => setPushRing((cur) => (cur && cur.callId === String(data?.callId ?? "") ? null : cur)), 40_000);
    }).then((fn) => { cleanupVoipIncoming = fn; }).catch(() => undefined);

    onPlanipretIncomingCallAnswered((data) => {
      // CallKit stays in "connecting" (and the app never opens on the keypad)
      // until the pending CXAnswerCallAction is fulfilled — that only happens
      // when we report the real outcome back through completeAnswer().
      try { ppSipProvider.forceReregister(); } catch {}
      try { window.dispatchEvent(new CustomEvent("pp:sip-callkit-answered", { detail: data })); } catch {}
      void (async () => {
        let ok = false;
        try { ok = !!(await answerRef.current?.()); }
        catch (e: any) { console.warn("[pp-voip] CallKit answer failed", e?.message ?? e); }
        // session.answer() only means that JsSIP accepted the command locally.
        // CallKit may be fulfilled only after the SIP dialog is truly confirmed;
        // the active-state effect above owns the success completion.
        if (!ok) void completePlanipretCallKitAnswer(data?.callId, false);
        console.info(`[pp-voip] CallKit answer command → ${ok ? "awaiting SIP confirmation" : "failed"}`);
      })();
    }).then((fn) => { cleanupVoipAnswer = fn; }).catch(() => undefined);


    onPlanipretIncomingCallRejected((data) => {
      try { ppSipProvider.hangup(); } catch {}
      setPushRing(null);
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
  }, [clientType, enabled, user?.id]);

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
    /** A live/ringing call must keep the WebView transport + media: any native
     *  takeover closes the JsSIP socket (WSS 1001) and the audio dies. */
    const callInProgress = () => {
      try {
        const st = ppSipProvider.getSnapshot().callState;
        return ppSipProvider.hasActiveCall() || st === "ringing-in" || st === "ringing-out";
      } catch { return false; }
    };
    // ring11 - every setCallActive(true) that crosses the bridge re-activates the
    // native AVAudioSession, and doing that during a live call cuts the WebRTC
    // audio. These handoff guards fire repeatedly (visibility churn, freeze,
    // pagehide, timers), so route them through the same de-dup ref as the main
    // call-state effect.
    const keepNativeCallActive = () => {
      if (lastNativeCallActiveRef.current === true) return;
      lastNativeCallActiveRef.current = true;
      void setPlanipretNativeCallActive(true);
    };
    const scheduleHandoff = (delay = 2500) => {
      if (handoffTimer) clearTimeout(handoffTimer);
      if (callInProgress()) { keepNativeCallActive(); return; }
      handoffTimer = setTimeout(() => {
        handoffTimer = null;
        const stillHidden = typeof document === "undefined" || document.visibilityState === "hidden";
        if (!stillHidden) return;
        if (callInProgress()) { keepNativeCallActive(); return; }
        void handoffToNative();
      }, delay);
    };
    const handoffToNative = async () => {
      if (callInProgress()) { keepNativeCallActive(); return; }
      // Both stacks register as the SAME NetSapiens device `<ext>M`:
      // ns-resolve-sip-credentials is called with `client_type: "mobile"` and the
      // resulting config feeds BOTH ppSipProvider.init() and
      // startPlanipretSipKeepAlive(). `<ext>W` is the browser widget, not this app.
      // NetSapiens allows one active transport per AOR, so the JS contact MUST be
      // released before native claims it - otherwise the PBX closes the sockets
      // alternately (WSS 1001 loop, hundreds of sockets).
      const cfg = mobileSipConfigRef.current ?? ppSipProvider.getConfig();
      if (!cfg) return;
      const seq = ++handoffSeq;
      try { await ppSipProvider.releaseForBackground(); } catch { /* noop */ }
      if (seq !== handoffSeq) return;
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
              handedOffToNative = true;
              return;
            }
          }
        } catch { /* retry */ }
        await new Promise((r) => setTimeout(r, 2_000 * (attempt + 1)));
      }
      // Native did not confirm registration. The VoIP-push wake path will retry;
      // do not reopen JsSIP while iOS is hidden and create concurrent ownership.
    };
    let nativeStopTimer: ReturnType<typeof setTimeout> | null = null;
    const stopNativeAfterWebRegistered = (force = false) => {
      // NetSapiens keeps ONE registration per AOR, and both stacks use the SAME
      // device `<ext>M` (see handoffToNative). Never drop the native registration
      // before JsSIP has a confirmed REGISTER 200 OK: that gap is what sends
      // inbound calls to voicemail.
      if (nativeStopTimer) clearTimeout(nativeStopTimer);
      // RINGING IS SACRED. `stopSipService` tears the WSS down; doing it while an
      // INVITE is ringing or a dialog is up terminated the JsSIP session, and
      // answer() then failed with INVALID_STATE_ERROR "Invalid status: 8"
      // (8 = STATUS_TERMINATED). `force` (foreground resume) must NOT bypass this:
      // tapping Answer in CallKit brings the app to the foreground, which is
      // exactly when the stop used to fire and kill the call being answered.
      if (callInProgress()) {
        console.warn("[pp-sip] native stop refused — call ringing/active owns the transport");
        return;
      }
      let tries = 0;
      const tick = () => {
        nativeStopTimer = null;
        if (callInProgress()) {
          console.warn("[pp-sip] native stop refused — call ringing/active owns the transport");
          return;
        }
        if (!force && typeof document !== "undefined" && document.visibilityState === "hidden") return;
        if (ppSipProvider.getSnapshot().status !== "registered") {
          if (tries++ >= 20) return; // keep native registered — safest state
          nativeStopTimer = setTimeout(tick, 1_000);
          return;
        }
        void getPlanipretSipKeepAliveStatus()
          .then((status) => {
            if (status?.status === "idle") return;
            return stopPlanipretSipKeepAlive();
          })
          .catch(() => undefined);
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
    let resumePending = false;
    const resumeSip = () => {
      const now = Date.now();
      if (resumePending || now - lastResumeAt < 4000) return;
      lastResumeAt = now;
      resumePending = true;
      void (async () => {
       try {
        // Never re-init JsSIP while a call is up: it would drop the media.
        if (callInProgress()) { evaluate(); return; }
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
          // Keep the native registration alive while JsSIP rebuilds: stopping
          // it first left the AOR unregistered (=> voicemail on inbound).
          if (!acquireSipInitLock(4000)) return;
          await ppSipProvider.init(cfg).finally(() => {
            handedOffToNative = false;
            releaseSipInitLock();
          });
          stopNativeAfterWebRegistered(true);
        } else {
          ppSipProvider.forceReregister();
          handedOffToNative = false;
          stopNativeAfterWebRegistered(true);
        }
       } catch { /* noop */ }
       finally { resumePending = false; }
       evaluate();
       // Backend fallback: the client can look "registered" while NS holds no
       // live binding. Ask the backend for the real state and self-heal.
       void checkSipBackendRegistration().then((check) => {
         if (!check || check.healthy) return;
         // A ringing INVITE outranks every self-healing action: forcing a
         // re-REGISTER here re-opened the transport under the live dialog.
         if (callInProgress()) {
           console.warn("[pp-sip] backend check unhealthy but call in progress → no self-heal", check);
           return;
         }
         // Same credibility rule as wakeForIncoming: a `mobile_registered:false`
         // returned together with `count:0` / empty `registered_aors` means the
         // probe read NOTHING, not that the AOR is gone. The PBX portal showed
         // 113M and 113W registered while this fired 3x per session.
         const reg = check.registration;
         if (reg?.mobile_registered === false && Number(reg?.count ?? 0) === 0) {
           console.warn("[pp-sip] backend check: unregistered claim not trusted (0 AOR read) → no self-heal", {
             count: reg?.count ?? null, probeStatuses: reg?.probe_statuses ?? null,
           });
           return;
         }
         console.warn("[pp-sip] backend registration check unhealthy", check);
         if (check.actions?.includes("reregister")) {
           ppSipProvider.forceReregister();
           handedOffToNative = false;
         }
         if (check.actions?.includes("refresh_push_token")) {
           lastVoipToken = null;
           try { localStorage.removeItem(VOIP_TOKEN_STORAGE_KEY); } catch { /* noop */ }
           void refreshPlanipretVoipPushToken();
         }
       });
      })();
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

    // Foreground-only watchdog. Background ownership is transferred exactly
    // once by the real lifecycle events above; a periodic handoff restarted the
    // native service every 15s and caused competing NetSapiens AOR bindings.
    const heartbeat = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
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
  // Owner-only: setPlanipretNativeCallActive() must be driven by ONE instance,
  // otherwise a sibling still seeing an idle snapshot pushes callActive=false and
  // tears the native audio session down mid-ring.
  useEffect(() => {
    if (!isOwner) return;
    const active = snap.callState === "active" || snap.callState === "held";
    const ringing = snap.callState === "ringing-in" || snap.callState === "ringing-out";
    // Keep the native iOS audio session alive while a call is up, otherwise
    // WebKit interrupts it as soon as the app is backgrounded (no audio).
    //
    // ring11 - only cross the bridge when the boolean actually flips. This effect
    // re-runs on every callState transition (ringing-in -> active -> held ...) and
    // each redundant setCallActive(true) used to re-activate the AVAudioSession,
    // which cuts the live WebRTC stream. The ring10 log shows 4 of them on a
    // single call. The native side is idempotent now too, but not paying for the
    // round trip at all is better.
    const desiredCallActive = active || ringing;
    if (lastNativeCallActiveRef.current !== desiredCallActive) {
      lastNativeCallActiveRef.current = desiredCallActive;
      void setPlanipretNativeCallActive(desiredCallActive);
    }
    if (!active) { setQuality(null); return; }
    const un = callQualitySampler.subscribe(setQuality);
    return () => { un(); };
  }, [snap.callState, isOwner]);

  // Cross-device call session sync (mobile ↔ widget via SIP Call-ID).
  // Owner-only: three mounted instances meant three concurrent claims on the same
  // Call-ID, so a claim could be "lost" to a sibling instance of THIS device.
  useEffect(() => {
    if (!isOwner) return;
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
  }, [snap.callId, snap.callState, snap.direction, snap.remoteNumber, brokerId, isOwner]);

  // Maestro call records (Scott's rules): outbound always, inbound only when
  // the caller is not another broker's VoIP number.
  // Owner-only: otherwise the same call was posted once per mounted instance.
  useEffect(() => {
    if (!isOwner) return;
    const callId = snap.callId;
    if (!callId) return;
    const ringing = snap.callState === "ringing-in" || snap.callState === "ringing-out" || snap.callState === "active";
    if (!ringing) return;
    if (snap.direction === "out") {
      postOutboundCall({ providerCallId: callId, number: snap.remoteNumber || snap.remoteIdentity || "" });
    } else if (snap.direction === "in") {
      postInboundCall({ providerCallId: callId, number: snap.remoteNumber || snap.remoteIdentity || "" });
    }
  }, [snap.callId, snap.callState, snap.direction, snap.remoteNumber, snap.remoteIdentity, isOwner]);

  // Push VoIP ring arrives before the INVITE — post the inbound call as soon as
  // we know the caller (rule 3), de-duplicated by provider_call_id.
  useEffect(() => {
    if (!isOwner) return;
    if (!pushRing?.callId) return;
    postInboundCall({ providerCallId: pushRing.callId, number: pushRing.from || "" });
  }, [pushRing?.callId, pushRing?.from, isOwner]);

  // Mark session ended when local call ends.
  useEffect(() => {
    if (!isOwner) return;
    if (snap.callState !== "ended" || !snap.callId) return;
    void endSession(snap.callId, snap.errorCause || "hangup");
  }, [snap.callState, snap.callId, snap.errorCause, isOwner]);

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

  // A live WebRTC session ALWAYS wins over the REST/DB attachment: otherwise the
  // realtime "ringing" row hijacks the snapshot and answer() goes REST-only,
  // leaving the real SIP session unanswered (no audio, no in-call keypad).
  const hasLiveSipSession = snap.callState === "ringing-in" || snap.callState === "ringing-out"
    || snap.callState === "active" || snap.callState === "held";

  // Dès qu'une vraie session SIP existe, le push n'a plus à piloter l'écran.
  useEffect(() => { if (hasLiveSipSession || snap.callState === "ended") setPushRing(null); }, [hasLiveSipSession, snap.callState]);

  const effectiveSnap = useMemo<PpSipSnapshot>(() => {
    const base: PpSipSnapshot = (nativeOwnsRegistration && snap.status !== "registered" && snap.status !== "connected")
      ? ({ ...snap, status: "registered", lastError: null } as PpSipSnapshot)
      : snap;
    if (!restCall?.id || hasLiveSipSession) {
      // Écran "ça sonne" piloté par le push VoIP tant que l'INVITE n'est pas là.
      if (!hasLiveSipSession && pushRing) {
        return {
          ...base,
          callState: "ringing-in",
          callId: pushRing.callId || base.callId,
          remoteIdentity: pushRing.from || "",
          remoteNumber: pushRing.from || "",
          direction: "in",
        } as PpSipSnapshot;
      }
      return base;
    }
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
  }, [snap, restCall, normalizeRestState, nativeOwnsRegistration, hasLiveSipSession, pushRing]);


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

  // Best-effort REST teardown with exponential backoff. Used on hangup so the
  // PBX always drops the leg even when the SIP WebSocket is down and the BYE
  // never leaves the device.
  const restDisconnectWithRetry = useCallback(async (callId: string | null | undefined) => {
    const id = callId || restCall?.id;
    if (!id) { console.info("[hangup] no PBX call id → REST disconnect skipped"); return false; }
    const delays = [0, 800, 2000, 5000];
    for (let i = 0; i < delays.length; i++) {
      if (delays[i]) await new Promise((r) => window.setTimeout(r, delays[i]));
      try {
        const { data, error } = await supabase.functions.invoke("pp-ns-calls", {
          body: { action: "disconnect", call_id: id },
        });
        if (!error && (data as any)?.success !== false) {
          console.info(`[hangup] NetSapiens confirmed call termination (call_id=${id}, attempt=${i + 1})`);
          setRestCall((cur) => (cur?.id === id ? null : cur));
          return true;
        }
        console.warn(`[hangup] REST disconnect attempt ${i + 1}/${delays.length} failed`, (error as any)?.message ?? (data as any)?.message ?? "unknown");
      } catch (e: any) {
        console.warn(`[hangup] REST disconnect attempt ${i + 1}/${delays.length} threw`, e?.message ?? e);
      }
    }
    console.error(`[hangup] NetSapiens did NOT confirm termination after ${delays.length} attempts (call_id=${id})`);
    return false;
  }, [restCall?.id]);


  const callViaPBX = useCallback(async (destination: string): Promise<OutboundResult> => {
    const { data, error } = await supabase.functions.invoke("pp-ns-calls", { body: { action: "start", to_number: destination, client_type: clientType } });
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
      // Rules 1 & 2 — always post outbound calls to Maestro.
      postOutboundCall({ providerCallId: callId, number: destination });
    }
    return { via: "pbx", ok: true, callId };
  }, [clientType]);


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

  // Last-resort pickup: ask NetSapiens to answer the live ringing leg over
  // NS-API. Used when the SIP INVITE never reaches the WebView after a VoIP
  // push — otherwise the caller keeps hearing the greeting/voicemail prompt
  // while the phone shows the call as answered.
  const restAnswerLiveCall = useCallback(async (): Promise<boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke("pp-ns-calls", { body: { action: "list" } });
      if (error) return false;
      const raw = (data as any)?.ns;
      const list: any[] = Array.isArray(raw) ? raw : (raw?.calls ?? raw?.data ?? []);
      const ringing = list.find((c) => {
        const s = String(c?.state ?? c?.status ?? c?.["call-state"] ?? "").toLowerCase();
        return s.includes("ring") || s.includes("offer") || s.includes("alert");
      }) ?? list[0];
      const id = ringing?.id ?? ringing?.call_id ?? ringing?.["call-id"] ?? ringing?.orig_callid;
      if (!id) { console.warn("[answer] REST fallback: no live call found on PBX"); return false; }
      const res = await supabase.functions.invoke("pp-ns-calls", { body: { action: "answer", call_id: id } });
      const ok = !res.error;
      console.info(`[answer] REST fallback answer(${id}) → ${ok ? "accepted" : "rejected"}`);
      if (ok) {
        setRestCall((cur) => cur ?? { id: String(id), direction: "in", status: "active", startedAt: Date.now(), number: "", other: "" } as any);
      }
      return ok;
    } catch (e: any) {
      console.warn("[answer] REST fallback threw", e?.message ?? e);
      return false;
    }
  }, []);

  // Wrapped answer: race to claim the call before actually picking up. If we
  // lose (widget answered first), don't pick up — the winner already has audio.
  // Every branch is logged so the exact route to answer() is visible in Xcode /
  // Logcat when debugging a VoIP-push answer.
  const answerOnce = useCallback(async () => {
    const sipSnap = ppSipProvider.getSnapshot();
    console.info("[answer] tapped", {
      hasLiveSipSession,
      sipCallState: sipSnap.callState,
      sipCallId: sipSnap.callId || null,
      pushCallId: pushRing?.callId ?? null,
      restCallId: restCall?.id ?? null,
    });

    // Push VoIP reçu mais INVITE pas encore arrivé : on bufferise la réponse,
    // ppSipProvider répondra dès que la session SIP se présente (aucune
    // comparaison de Call-ID : push id ≠ SIP Call-ID).
    const liveSipNow = ["ringing-in", "ringing-out", "active", "held"].includes(sipSnap.callState);
    if (!liveSipNow && pushRing) {
      console.info("[answer] route=PUSH-PENDING → wakeForIncoming + requestAnswer", {
        pushCallId: pushRing.callId ?? null,
      });
      // requestAnswer queues the intent first, then performs exactly one wake.
      // Waking here too sent duplicate priority REGISTERs on the same socket.
      const immediate = await ppSipProvider.requestAnswer(pushRing.callId || undefined);
      console.info(`[answer] requestAnswer → ${immediate ? "answered immediately" : "intent queued"}`);
      if (immediate) return true;

      // ring12 - ROOT CAUSE OF "the answer button does nothing".
      //
      // This branch used to park HERE in a 500ms polling loop for up to
      // PP_PENDING_ANSWER_TIMEOUT_MS. That promise is the one stored in
      // answerAttemptRef by answer(), so for the next ~30 seconds EVERY tap on
      // the answer button was handed this parked polling promise back
      // ("joining answer already in flight" x17 in the log) and no tap could
      // ever reach ppSipProvider.answer(). The user sees a dead button while the
      // phone is ringing.
      //
      // ring11 tried to fix this by clearing answerAttemptRef inside this
      // function, but that cannot work: answer() assigns
      // `answerAttemptRef.current = run` AFTER answerOnce() returns its promise,
      // so the assignment can land after our own clear and re-lock the mutex.
      //
      // The correct fix is to never park inside the mutex-held promise at all.
      // The intent is queued in the provider, which now answers the INVITE
      // directly when it arrives. We return immediately, the mutex is released
      // normally, and a manual tap on a real ringing-in session always gets a
      // fresh transaction.
      console.info("[answer] intent queued; returning immediately so the answer button stays live", {
        pushCallId: pushRing.callId ?? null,
      });
      return false;
    }

    // `ringing-in` is the only state that may be answered. Treating an active
    // or outgoing session as answerable made CallKit wait on a command that
    // could never produce a new confirmed inbound dialog.
    if (sipSnap.callState === "active" || sipSnap.callState === "held") return true;
    if (sipSnap.callState !== "ringing-in") {
      console.warn("[answer] no inbound SIP INVITE available", { state: sipSnap.callState });
      return false;
    }

    if (restCall?.id && !liveSipNow) {
      console.info("[answer] route=REST (pp-ns-calls answer)", { call_id: restCall.id });
      const ok = await restControl("answer");
      console.info(`[answer] REST answer ${ok ? "accepted" : "REJECTED"} by NetSapiens`);
      return ok;
    }

    const callId = sipSnap.callId;

    // ORDER IS CRITICAL — SIP FIRST, CLAIM SECOND.
    //
    // The claim used to run BEFORE session.answer(). Its Supabase round-trip can
    // take seconds on a cold radio right after a VoIP push; in a captured log it
    // took ~17s. During that window the foreground/background SIP-owner
    // arbitration called stopSipService, which killed the WSS, so by the time
    // answer() finally ran JsSIP reported:
    //   INVALID_STATE_ERROR "Invalid status: 8"   (8 = STATUS_TERMINATED)
    // CallKit then failed the action and the call was destroyed: no audio, no
    // in-call screen, caller left listening to the greeting.
    //
    // Sending the 200 OK is the only time-critical step, so it runs first and the
    // claim becomes post-hoc arbitration. Answering a call the widget also
    // answered is recoverable (we hang up right after); losing the dialog is not.
    console.info("[answer] route=SIP → answering INVITE first (claim runs after)", { callId });
    // Re-read the live session immediately before handing it to JsSIP. Anything
    // awaited above (pending-answer arbitration, native wake, route decision) may
    // have taken seconds, and the PBX can have advanced the call to greeting or
    // voicemail meanwhile. Calling answer() on a dead session produced the
    // opaque INVALID_STATE_ERROR "Invalid status: 8"; this gives an exact cause.
    const answerable = ppSipProvider.getSnapshot();
    if (answerable.callState === "active" || answerable.callState === "held") {
      console.info("[answer] concurrent local path already confirmed the dialog", { callId });
      return true;
    }
    if (answerable.callState !== "ringing-in" || answerable.callId !== callId) {
      console.warn("[answer] INVITE expired before answering", {
        expectedCallId: callId,
        currentCallId: answerable.callId || null,
        state: answerable.callState,
      });
      return false;
    }
    const ok = await ppSipProvider.answer(callId);
    console.info(`[answer] ppSipProvider.answer → ${ok ? "SIP 200 OK sent" : "FAILED"}`, { callId });
    if (!ok) return false;

    // Post-hoc arbitration: must never block the media path.
    void claimCall(callId, "mobile").then((won) => {
      if (won) return;
      const liveState = ppSipProvider.getSnapshot().callState;
      if (liveState === "active" || liveState === "held") {
        console.warn("[answer] claim lost but local dialog is live → keeping the call", { callId, liveState });
        return;
      }
      console.warn("[answer] claim lost after answering → conceding to widget");
      setAnsweredElsewhere("widget");
      try { ppSipProvider.hangup(); } catch {}
    }).catch(() => { /* claim is best-effort; the live dialog wins */ });
    // Do not report success to CallKit on a locally accepted answer command.
    // Wait until JsSIP receives the confirmed dialog from the PBX.
    for (let i = 0; i < 16; i++) {
      await new Promise((r) => window.setTimeout(r, 250));
      const state = ppSipProvider.getSnapshot().callState;
      if (state === "active" || state === "held") break;
      if (state === "ended") return false;
      if (i === 15) return false;
    }
    // Clear the REST/DB attachment so the in-call UI follows the live session.
    if (ok && restCall?.id) setRestCall(null);
    return ok;
  }, [restCall?.id, restControl, hasLiveSipSession, pushRing]);

  const answer = useCallback((): Promise<boolean> => {
    const pending = answerAttemptRef.current;
    // ring12 - the mutex must never be able to swallow a tap on a live INVITE.
    //
    // A ringing-in session is answerable right now, and the 200 OK is the only
    // time-critical step of the whole inbound path. If an earlier attempt is
    // still in flight but the session is sitting in ringing-in, that attempt
    // demonstrably has not sent the 200 OK yet, so joining it is exactly the
    // wrong thing to do. ppSipProvider.answer() carries its own answerInFlight
    // guard, so running a fresh transaction here cannot double-answer.
    const liveRinging = ppSipProvider.getSnapshot().callState === "ringing-in";
    if (pending && !liveRinging) {
      console.info("[answer] joining answer already in flight");
      return pending;
    }
    if (pending && liveRinging) {
      console.info("[answer] bypassing in-flight attempt: a real INVITE is ringing and must be answered now");
    }
    const run = answerOnce();
    answerAttemptRef.current = run;
    void run.finally(() => {
      if (answerAttemptRef.current === run) answerAttemptRef.current = null;
    });
    return run;
  }, [answerOnce]);

  useEffect(() => { answerRef.current = answer; }, [answer]);

  // Owner-only: with three mounted instances this event fired three concurrent
  // answer() transactions on the same INVITE.
  useEffect(() => {
    if (!isOwner) return;
    const onPendingAnswerReady = () => {
      // This is NOT a duplicate tap: it is the first moment a real SIP INVITE
      // exists, so it must run a real answer transaction. Since ring12 the
      // PUSH-PENDING branch no longer parks inside the mutex-held promise, and
      // answer() itself bypasses the mutex whenever a ringing-in session is
      // live, so this clear is now only belt-and-braces against a stale ref.
      answerAttemptRef.current = null;
      void answerRef.current?.().then((ok) => {
        console.info(`[answer] arbitrated pending INVITE → ${ok ? "connected" : "not answered"}`);
      });
    };
    window.addEventListener("pp:sip-pending-answer-ready", onPendingAnswerReady);
    return () => window.removeEventListener("pp:sip-pending-answer-ready", onPendingAnswerReady);
  }, [isOwner]);



  const hangup = useCallback(() => {
    const callId = ppSipProvider.getSnapshot().callId;
    const restId = restCall?.id ?? null;
    console.info("[hangup] requested", { sipCallId: callId || null, restCallId: restId, hasLiveSipSession });
    // Always signal the PBX over REST as well, with retry + backoff: the SIP BYE
    // can be lost when the WebSocket dropped or the session never reached
    // "active", which would leave the call up on NetSapiens.
    void restDisconnectWithRetry(restId);
    if (restId && !hasLiveSipSession) {
      void updateCallIfPosted(restId, { status: "ended", ended_reason: "completed" });
      setRestCall(null);
      setPushRing(null);
      return;
    }
    try { ppSipProvider.hangup(); console.info("[hangup] SIP BYE sent"); }
    catch (e: any) { console.warn("[hangup] SIP BYE failed", e?.message ?? e); }
    setPushRing(null);
    if (restId) setRestCall(null);
    if (callId) {
      void endSession(callId, "hangup");
      void updateCallIfPosted(callId, { status: "ended", ended_reason: "completed" });
    }
  }, [restCall?.id, restDisconnectWithRetry, hasLiveSipSession]);




  const attachRestCall = useCallback((attachment: RestCallAttachment | null) => {
    if (!attachment?.id) { setRestCall(null); return; }
    const direction = attachment.direction ?? "out";
    setRestCall({
      ...attachment,
      direction,
      status: attachment.status ?? "active",
      startedAt: attachment.startedAt ?? Date.now(),
    });
    // Scott's rules also apply to calls attached from the PBX live-call list:
    // outbound always posts (1 & 2), inbound posts unless the caller is a
    // broker VoIP number (3 & 4). De-duplicated by provider_call_id.
    const number = attachment.number ?? attachment.other ?? "";
    if (direction === "out") postOutboundCall({ providerCallId: attachment.id, number });
    else postInboundCall({ providerCallId: attachment.id, number });
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
    mute: () => (restCall?.id && !hasLiveSipSession) ? void restControl("mute", { muted: true }) : ppSipProvider.mute(),
    unmute: () => (restCall?.id && !hasLiveSipSession) ? void restControl("mute", { muted: false }) : ppSipProvider.unmute(),
    hold: () => (restCall?.id && !hasLiveSipSession) ? void restControl("hold") : ppSipProvider.hold(),
    unhold: () => (restCall?.id && !hasLiveSipSession) ? void restControl("unhold") : ppSipProvider.unhold(),
    sendDTMF: (k: string) => (restCall?.id && !hasLiveSipSession) ? void restControl("dtmf", { digit: k }) : ppSipProvider.sendDTMF(k),
    transfer: (t: string) => (restCall?.id && !hasLiveSipSession) ? void restControl("transfer", { destination: t, target: t }) : ppSipProvider.transfer(t),
    // The provider owns a persistent hidden <audio> sink; screens must not
    // detach it on unmount (that killed remote audio mid-call).
    setAudioEl: (_el: HTMLAudioElement | null) => {},

    forceHandover: () => handoverController.forceHandover(),
  }), [effectiveSnap, loading, net, quality, nativeStatus, sipConnected, placeCall, answer, hangup, answeredElsewhere, attachRestCall, restCall?.id, restControl, hasLiveSipSession]);


}
