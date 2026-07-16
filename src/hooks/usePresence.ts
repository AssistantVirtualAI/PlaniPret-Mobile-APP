import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type PresenceStatus = "available" | "busy" | "away" | "dnd" | "offline" | "out_of_office";
export type CallState = "idle" | "ringing" | "active" | "held";

function detectPlatform(): string {
  if (typeof navigator === "undefined") return "web";
  const ua = navigator.userAgent.toLowerCase();
  if (/(iphone|ipad|ipod)/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  if (/electron/.test(ua)) return "desktop";
  return "web";
}

export function usePresence(opts?: {
  status?: PresenceStatus;
  callState?: CallState;
  message?: string;
  emoji?: string;
}) {
  const { user } = useAuth();
  const lastRef = useRef<string>("");

  useEffect(() => {
    if (!user) return;
    const platform = detectPlatform();
    const push = async (s: PresenceStatus = opts?.status ?? "available", cs: CallState = opts?.callState ?? "idle") => {
      const sig = `${s}|${cs}|${opts?.message ?? ""}|${opts?.emoji ?? ""}`;
      lastRef.current = sig;
      try {
        await (supabase.rpc as any)("upsert_user_presence", {
          _status: s,
          _message: opts?.message ?? null,
          _emoji: opts?.emoji ?? null,
          _call_state: cs,
          _platform: platform,
        });
      } catch {}
    };

    push();
    const interval = setInterval(() => push(), 30_000);
    const onVis = () => { if (document.visibilityState === "visible") push(); };
    document.addEventListener("visibilitychange", onVis);

    const onUnload = () => {
      navigator.sendBeacon?.(
        `${(supabase as any).supabaseUrl}/rest/v1/rpc/upsert_user_presence`,
        new Blob([JSON.stringify({ _status: "offline", _call_state: "idle", _platform: platform })], {
          type: "application/json",
        })
      );
    };
    window.addEventListener("beforeunload", onUnload);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [user?.id, opts?.status, opts?.callState, opts?.message, opts?.emoji]);
}
