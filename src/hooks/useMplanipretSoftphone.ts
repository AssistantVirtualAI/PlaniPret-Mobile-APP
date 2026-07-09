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
import { ppSipProvider, type PpSipSnapshot } from "@/lib/planipret/sip/ppSipProvider";
import { networkMonitor, type NetSample } from "@/lib/planipret/network/networkMonitor";
import { handoverController } from "@/lib/planipret/net/handoverController";
import { callQualitySampler, type CallQualitySnapshot } from "@/lib/planipret/audio/callQualitySampler";
import { getAudioConstraints, type NCMode } from "@/lib/planipret/audio/audioConstraints";
import { ensureMicPermission, type MicPermissionState } from "@/lib/planipret/audio/micPermission";
import {
  upsertRingingSession,
  claimCall,
  endSession,
  subscribeToCall,
  type CallSessionRow,
  type AnsweredBy,
} from "@/lib/planipret/calls/callSessionSync";



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
  | { via: "pbx"; ok: true }
  | { via: "none"; ok: false; error: string; micState?: MicPermissionState };

type RestCallAttachment = {
  id: string;
  direction?: "in" | "out";
  other?: string;
  number?: string;
  status?: PpSipSnapshot["callState"] | string;
  startedAt?: number;
};

export function useMplanipretSoftphone() {
  const { user } = useAuth();
  const [snap, setSnap] = useState<PpSipSnapshot>(() => ppSipProvider.getSnapshot());
  const [loading, setLoading] = useState(false);
  const [net, setNet] = useState<NetSample>(networkMonitor.current());
  const [quality, setQuality] = useState<CallQualitySnapshot | null>(null);
  const [brokerId, setBrokerId] = useState<string | null>(null);
  const [answeredElsewhere, setAnsweredElsewhere] = useState<AnsweredBy | null>(null);
  const [restCall, setRestCall] = useState<RestCallAttachment | null>(null);
  const seenCallIds = useRef<Set<string>>(new Set());

  // Subscribe to the SIP snapshot.
  useEffect(() => ppSipProvider.subscribe(setSnap), []);

  // Boot audio proxy + network monitor + handover once.
  useEffect(() => {
    ensureGumProxy();
    handoverController.start();
    const un = networkMonitor.subscribe(setNet);
    return () => { un(); };
  }, []);

  // Load broker id (planipret_profiles.id) once.
  useEffect(() => {
    if (!user) { setBrokerId(null); return; }
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
  }, [user?.id]);

  // Resolve NS-API SIP credentials and register the softphone per user.
  // Re-runs whenever the ExtensionSync page dispatches `pp:sip-ready`, so a
  // freshly-created `{ext}_mobile` device actually REGISTERs and shows up in
  // NetSapiens with IP/User-Agent instead of empty columns.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const doInit = async (opts?: { force?: boolean }) => {
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
        await ppSipProvider.init({
          extension: String(d.sip_extension),
          sipUsername: String(d.sip_username || d.sip_extension),
          sipDomain: String(d.sip_domain),
          sipProxy: d.sip_proxy,
          wssUrl,
          wssUrls,
          password: String(d.sip_password),
          displayName: String(d.display_name || d.sip_display_name || d.sip_extension),
        });
        // Broadcast our registered device id so any UI can highlight it.
        try {
          window.dispatchEvent(new CustomEvent("pp:sip-registered", {
            detail: { registered: true, deviceId: d.device_id },
          }));
        } catch {}
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void doInit();
    const onReady = (e: any) => { void doInit({ force: !!e?.detail?.force }); };
    const onForce = () => { void doInit({ force: true }); };
    window.addEventListener("pp:sip-ready", onReady as any);
    window.addEventListener("pp:sip-force-reregister", onForce as any);
    return () => {
      cancelled = true;
      window.removeEventListener("pp:sip-ready", onReady as any);
      window.removeEventListener("pp:sip-force-reregister", onForce as any);
    };
  }, [user?.id]);


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

  const effectiveSnap = useMemo<PpSipSnapshot>(() => {
    if (!restCall?.id) return snap;
    const state = normalizeRestState(restCall.status);
    return {
      ...snap,
      callState: state,
      callId: restCall.id,
      remoteIdentity: restCall.other || restCall.number || "—",
      remoteNumber: restCall.number || restCall.other || "",
      direction: restCall.direction ?? null,
      startedAt: restCall.startedAt ?? snap.startedAt ?? Date.now(),
      onHold: state === "held",
    };
  }, [snap, restCall, normalizeRestState]);

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
    const { data, error } = await supabase.functions.invoke("pp-ns-calls", { body: { action: "start", to_number: destination } });
    if (error || (data as any)?.success === false) {
      const msg = (data as any)?.message ?? (data as any)?.error ?? error?.message ?? "PBX call failed";
      return { via: "none", ok: false, error: msg };
    }
    return { via: "pbx", ok: true };
  }, []);

  const placeCall = useCallback(async (destination: string): Promise<OutboundResult> => {
    if (!destination) return { via: "none", ok: false, error: "empty destination" };
    const mic = await ensureMicPermission();
    if (mic.state !== "granted") {
      try { mic.stream?.getTracks().forEach((tr) => tr.stop()); } catch {}
      return { via: "none", ok: false, error: mic.error ?? "microphone unavailable", micState: mic.state };
    }
    try { mic.stream?.getTracks().forEach((tr) => tr.stop()); } catch {}
    if (registered) {
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
    if (restCall?.id) { void restControl("disconnect"); return; }
    const callId = ppSipProvider.getSnapshot().callId;
    ppSipProvider.hangup();
    if (callId) void endSession(callId, "hangup");
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

  return useMemo(() => ({
    snap: effectiveSnap,
    loading,
    net,
    quality,
    placeCall,
    answeredElsewhere,
    dismissAnsweredElsewhere: () => setAnsweredElsewhere(null),
    attachRestCall,
    call: (n: string) => ppSipProvider.call(n),
    answer,
    hangup,
    mute: () => restCall?.id ? void restControl("mute", { muted: true }) : ppSipProvider.mute(),
    unmute: () => restCall?.id ? void restControl("mute", { muted: false }) : ppSipProvider.unmute(),
    hold: () => restCall?.id ? void restControl("hold") : ppSipProvider.hold(),
    unhold: () => restCall?.id ? void restControl("unhold") : ppSipProvider.unhold(),
    sendDTMF: (k: string) => restCall?.id ? void restControl("dtmf", { digit: k }) : ppSipProvider.sendDTMF(k),
    transfer: (t: string) => restCall?.id ? void restControl("transfer", { destination: t, target: t }) : ppSipProvider.transfer(t),
    setAudioEl: (el: HTMLAudioElement | null) => { ppSipProvider.audioEl = el; },
    forceHandover: () => handoverController.forceHandover(),
  }), [effectiveSnap, loading, net, quality, placeCall, answer, hangup, answeredElsewhere, attachRestCall, restCall?.id, restControl]);

}
