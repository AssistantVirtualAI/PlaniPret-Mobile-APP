/**
 * usePpNotificationBadge — Centralized notification badge hook for Planiprêt Mobile.
 *
 * Aggregates unread counts from ALL sources:
 *  - SMS inbound non lus (planipret_phone_messages)
 *  - Boîtes vocales non lues (planipret_voicemails)
 *  - Appels manqués (planipret_phone_calls — missed/no-answer)
 *  - Notifications AVA (planipret_ava_notifications)
 *  - MS365 emails non lus (ms365-actions read_emails count)
 *
 * Updates via:
 *  1. Initial fetch on mount.
 *  2. Supabase Realtime postgres_changes on all relevant tables.
 *  3. Periodic refresh every 60s (catches missed Realtime events).
 *  4. Visibility/focus resume refresh.
 *
 * Returns:
 *  - totalUnread: number (sum of all sources — shown on the bell)
 *  - counts: breakdown per source
 *  - refresh(): force a manual refresh
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PpNotifCounts {
  sms: number;
  voicemail: number;
  missedCalls: number;
  ava: number;
  ms365: number;
}

export interface PpNotificationBadge {
  totalUnread: number;
  counts: PpNotifCounts;
  refresh: () => void;
}

const EMPTY: PpNotifCounts = { sms: 0, voicemail: 0, missedCalls: 0, ava: 0, ms365: 0 };

export function usePpNotificationBadge(userId: string | undefined): PpNotificationBadge {
  const [counts, setCounts] = useState<PpNotifCounts>(EMPTY);
  const refreshing = useRef(false);
  const mounted = useRef(true);

  const fetchCounts = useCallback(async () => {
    if (!userId || refreshing.current) return;
    refreshing.current = true;
    try {
      const [smsRes, vmRes, missedRes, avaRes] = await Promise.allSettled([
        // SMS inbound non lus
        supabase
          .from("planipret_phone_messages")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("direction", "inbound")
          .is("read_at", null),
        // Boîtes vocales non lues
        supabase
          .from("planipret_voicemails")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("folder", "inbox")
          .eq("is_read", false),
        // Appels manqués (inbound + statut missed/no-answer/abandoned)
        supabase
          .from("planipret_phone_calls")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("direction", "inbound")
          .in("status", ["missed", "no-answer", "abandoned", "no_answer"]),
        // Notifications AVA non lues
        supabase
          .from("planipret_ava_notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .is("read_at", null),
      ]);

      // MS365 unread emails — best-effort, non-blocking
      let ms365Count = 0;
      try {
        const ms365Res = await supabase.functions.invoke("ms365-actions", {
          body: { action: "unread_count" },
        });
        ms365Count = (ms365Res.data as any)?.unread_count ?? 0;
      } catch { /* MS365 may not be configured */ }

      if (!mounted.current) return;
      setCounts({
        sms: smsRes.status === "fulfilled" ? (smsRes.value.count ?? 0) : 0,
        voicemail: vmRes.status === "fulfilled" ? (vmRes.value.count ?? 0) : 0,
        missedCalls: missedRes.status === "fulfilled" ? (missedRes.value.count ?? 0) : 0,
        ava: avaRes.status === "fulfilled" ? (avaRes.value.count ?? 0) : 0,
        ms365: ms365Count,
      });
    } finally {
      refreshing.current = false;
    }
  }, [userId]);

  // Initial fetch + periodic refresh every 60s
  useEffect(() => {
    mounted.current = true;
    void fetchCounts();
    const interval = setInterval(() => { void fetchCounts(); }, 60_000);
    return () => {
      mounted.current = false;
      clearInterval(interval);
    };
  }, [fetchCounts]);

  // Visibility/focus resume
  useEffect(() => {
    const onResume = () => { void fetchCounts(); };
    const onVis = () => { if (document.visibilityState === "visible") onResume(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onResume);
    // Capacitor app foreground
    const cap: any = (typeof window !== "undefined") ? (window as any).Capacitor : null;
    let appHandle: { remove: () => void } | null = null;
    if (cap?.isNativePlatform?.()) {
      try {
        const AppPlugin = cap?.Plugins?.App;
        if (AppPlugin?.addListener) {
          const p = AppPlugin.addListener("appStateChange", (state: { isActive: boolean }) => {
            if (state?.isActive) void fetchCounts();
          });
          if (p && typeof p.then === "function") p.then((h: any) => { appHandle = h; }).catch(() => {});
          else appHandle = p;
        }
      } catch { /* ignore */ }
    }
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onResume);
      try { appHandle?.remove?.(); } catch {}
    };
  }, [fetchCounts]);

  // Realtime — subscribe to all relevant tables
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`pp-badge:${userId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "planipret_phone_messages",
        filter: `user_id=eq.${userId}`,
      }, () => { void fetchCounts(); })
      .on("postgres_changes", {
        event: "*", schema: "public", table: "planipret_voicemails",
        filter: `user_id=eq.${userId}`,
      }, () => { void fetchCounts(); })
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "planipret_phone_calls",
        filter: `user_id=eq.${userId}`,
      }, () => { void fetchCounts(); })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "planipret_phone_calls",
        filter: `user_id=eq.${userId}`,
      }, () => { void fetchCounts(); })
      .on("postgres_changes", {
        event: "*", schema: "public", table: "planipret_ava_notifications",
        filter: `user_id=eq.${userId}`,
      }, () => { void fetchCounts(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, fetchCounts]);

  const totalUnread = counts.sms + counts.voicemail + counts.missedCalls + counts.ava + counts.ms365;

  return {
    totalUnread,
    counts,
    refresh: () => { void fetchCounts(); },
  };
}
