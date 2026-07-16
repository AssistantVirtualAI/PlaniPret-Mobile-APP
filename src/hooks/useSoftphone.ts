import { useEffect, useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { sipProvider, SoftphoneSnapshot, SoftphoneConfig } from "@/lib/softphone/jssipProvider";
import { ringback, ringtone } from "@/lib/softphone/ringtonePlayer";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type UserStatus = "available" | "busy" | "dnd" | "away";

let passwordHealInFlight = false;
let lastPasswordHealKey = "";

function detectSoftphonePlatform(): "app" | "desktop" | "mobile" {
  if (typeof window === "undefined") return "app";
  const w = window as any;
  const ua = navigator.userAgent || "";
  if (w.electron || w.__TAURI__ || /Electron|Tauri|AVA Desktop/i.test(ua)) return "desktop";
  if (w.Capacitor || w.cordova || /Capacitor|Cordova|ReactNative|AVA Mobile/i.test(ua)) return "mobile";
  return "app";
}

function sanitizeWss(u: any): string | null {
  if (typeof u !== "string" || !u) return null;
  return /^wss?:\/\//i.test(u) ? u : null;
}

function buildConfig(raw: any): SoftphoneConfig {
  const extension = raw.extension;
  const sipDomain = raw.sipDomain || raw.sip_domain || "lemtel.lemtel.tel";
  const primary = sanitizeWss(raw.wssUrl || raw.wss_url) || "wss://pbxnode.lemtel.tel:7443";
  const fallbacks = ((raw.wssUrls || raw.wss_urls || []) as any[])
    .map(sanitizeWss)
    .filter((u): u is string => !!u);
  const wssUrls = Array.from(new Set([primary, ...fallbacks, "wss://pbxnode.lemtel.tel:7443", "wss://node.lemtelcloud.net:7443"]));
  return {
    extension,
    displayName: raw.displayName || raw.display_name || extension,
    sipDomain,
    wssUrl: primary,
    wssUrls,
    password: raw.password || raw.sip_password || "",
    mock: !!raw.mock,
    passwordSource: raw.passwordSource || raw.password_source || undefined,
    sipUri: raw.sipUri || raw.sip_uri || (extension ? `sip:${extension}@${sipDomain}` : undefined),
    authUsername: raw.authUsername || raw.auth_username || extension,
  };
}

export function useSoftphone() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [snap, setSnap] = useState<SoftphoneSnapshot>(() => sipProvider.getSnapshot());
  const [config, setConfig] = useState<SoftphoneConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [userStatus, setUserStatus] = useState<UserStatus>("available");
  const callStartRef = useRef<number | null>(null);
  const callMetaRef = useRef<{ direction: "in" | "out" | null; remote: string }>({ direction: null, remote: "" });

  useEffect(() => {
    const unsub = sipProvider.subscribe(setSnap);
    return () => { unsub(); };
  }, []);

  // Initialize once per user
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("softphone-credentials", { body: { platform: detectSoftphonePlatform() } });
        if (cancelled) return;
        if (error || !data || (data as any).error) {
          setConfig(null);
          return;
        }
        const cfg = buildConfig(data as any);
        setConfig(cfg);
        await sipProvider.init(cfg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (!user || !config || snap.status !== "error") return;
    if (!/rejected|403|forbidden|auth/i.test(snap.errorCause || "")) return;
    const healKey = `${user.id}:${config.extension}:${snap.errorCause}`;
    if (passwordHealInFlight || lastPasswordHealKey === healKey) return;
    passwordHealInFlight = true;
    lastPasswordHealKey = healKey;
    (async () => {
      try {
        sipProvider.log("warn", "sip", "Registration rejected; forcing stored password into PBX and app auth");
        const { data, error } = await supabase.functions.invoke("softphone-sync-password", {
          body: { force_local_to_pbx: true },
        });
        if (error || (data as any)?.error) throw new Error(error?.message || (data as any)?.message || (data as any)?.error);
        const creds = await supabase.functions.invoke("softphone-credentials", { body: { platform: detectSoftphonePlatform() } });
        if (creds.error || !creds.data || (creds.data as any)?.error) throw new Error(creds.error?.message || (creds.data as any)?.message || "Credential refresh failed");
        const cfg = buildConfig(creds.data as any);
        setConfig(cfg);
        await sipProvider.init(cfg);
      } catch (e: any) {
        sipProvider.log("error", "sip", `Password auto-sync failed: ${e?.message || e}`);
      } finally {
        passwordHealInFlight = false;
      }
    })();
  }, [user?.id, config, snap.status, snap.errorCause]);

  // Ringtone on incoming call
  useEffect(() => {
    if (snap.callState === "ringing-in") {
      ringtone.start();
      // Browser notification
      if ("Notification" in window) {
        if (Notification.permission === "granted") {
          try {
            new Notification("Incoming Call — AVA Softphone", {
              body: snap.remoteIdentity || snap.remoteNumber || "Unknown",
              icon: "/favicon.png",
            });
          } catch {}
        } else if (Notification.permission === "default") {
          Notification.requestPermission().catch(() => {});
        }
      }
    } else {
      ringtone.stop();
    }
  }, [snap.callState, snap.remoteIdentity, snap.remoteNumber]);

  // Local outgoing ringback, aligned with the mobile app behavior.
  useEffect(() => {
    if (snap.callState === "ringing-out") ringback.start();
    else ringback.stop();
    return () => ringback.stop();
  }, [snap.callState]);

  // Presence: flip to on_call when active; revert to previous on end
  const prevStatusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user) return;
    const active = snap.callState === "active" || snap.callState === "ringing-in" || snap.callState === "ringing-out";
    if (active && prevStatusRef.current === null) {
      try { prevStatusRef.current = window.sessionStorage.getItem("ava.presence.prev") || userStatus; } catch { prevStatusRef.current = userStatus; }
      try { window.sessionStorage.setItem("ava.presence.prev", prevStatusRef.current ?? "available"); } catch {}
      (supabase.rpc as any)("upsert_user_presence", {
        _status: prevStatusRef.current ?? "available",
        _call_state: "on_call",
        _platform: detectSoftphonePlatform(),
      }).then?.(() => {});
    }
    if (snap.callState === "ended" && prevStatusRef.current) {
      const prev = prevStatusRef.current;
      prevStatusRef.current = null;
      try { window.sessionStorage.removeItem("ava.presence.prev"); } catch {}
      (supabase.rpc as any)("upsert_user_presence", {
        _status: prev,
        _call_state: "idle",
        _platform: detectSoftphonePlatform(),
      }).then?.(() => {});
    }
  }, [snap.callState, user, userStatus]);

  // Persist call history to pbx_call_records when a call ends
  useEffect(() => {
    if (snap.callState === "ringing-out" || snap.callState === "ringing-in" || snap.callState === "active") {
      if (!callStartRef.current) callStartRef.current = Date.now();
      callMetaRef.current = {
        direction: snap.direction,
        remote: snap.remoteNumber || snap.remoteIdentity || "",
      };
    }
    if (snap.callState === "ended" && callStartRef.current && user) {
      const startedAt = new Date(callStartRef.current).toISOString();
      const endedAt = new Date().toISOString();
      const durationSec = Math.max(0, Math.round((Date.now() - callStartRef.current) / 1000));
      const meta = callMetaRef.current;
      callStartRef.current = null;
      callMetaRef.current = { direction: null, remote: "" };
      if (meta.remote) {
        (supabase.rpc as any)("log_softphone_call", {
          _direction: meta.direction === "in" ? "inbound" : "outbound",
          _remote_number: meta.remote,
          _started_at: startedAt,
          _ended_at: endedAt,
          _duration_seconds: durationSec,
          _hangup_cause: snap.errorCause || null,
          _sip_call_id: null,
        }).then(({ error }: any) => {
          if (error) console.warn("[softphone] log_softphone_call failed:", error.message);
          else queryClient.invalidateQueries({ queryKey: ["webphone-recents"] });
        });
      }
    }
  }, [snap.callState, snap.direction, snap.remoteNumber, snap.remoteIdentity, snap.errorCause, user, queryClient]);

  // Update status in DB
  const setStatus = useCallback(async (s: UserStatus) => {
    setUserStatus(s);
    if (!user) return;
    await supabase
      .from("pbx_softphone_users")
      .update({ status: s, last_seen_at: new Date().toISOString() })
      .eq("portal_user_id", user.id);
  }, [user?.id]);

  return {
    snap,
    config,
    loading,
    userStatus,
    setStatus,
    call: (n: string) => sipProvider.call(n),
    answer: () => sipProvider.answer(),
    hangup: () => sipProvider.hangup(),
    mute: () => sipProvider.mute(),
    unmute: () => sipProvider.unmute(),
    hold: () => sipProvider.hold(),
    unhold: () => sipProvider.unhold(),
    sendDTMF: (k: string) => sipProvider.sendDTMF(k),
    transfer: (t: string) => sipProvider.transfer(t),
    setAudioEl: (el: HTMLAudioElement | null) => { sipProvider.audioEl = el; },
    simulateIncoming: (n: string) => sipProvider.simulateIncoming(n),
  };
}
