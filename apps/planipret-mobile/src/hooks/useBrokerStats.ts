import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type BrokerStatsPeriod = "1d" | "7d" | "30d";

export interface BrokerStats {
  total_calls: number;
  inbound: number;
  outbound: number;
  missed: number;
  avg_duration: number;
  answer_rate: number;
  hot_leads: number;
  warm_leads: number;
  avg_coaching: number;
  analyzed_calls: number;
  recordings: number;
  sms_sent: number;
  sms_received: number;
  ava_sessions: number;
}

const EMPTY: BrokerStats = {
  total_calls: 0, inbound: 0, outbound: 0, missed: 0,
  avg_duration: 0, answer_rate: 0, hot_leads: 0, warm_leads: 0,
  avg_coaching: 0, analyzed_calls: 0, recordings: 0,
  sms_sent: 0, sms_received: 0, ava_sessions: 0,
};

/**
 * Shared broker stats — same source of truth for mobile home + admin overview.
 * Scoped by broker `user_id` (planipret_phone_calls.user_id). Extension is
 * carried purely to name the realtime channel uniquely per broker session.
 */
export function useBrokerStats(
  brokerId: string | null | undefined,
  extension?: string | null,
  period: BrokerStatsPeriod = "1d"
) {
  const [stats, setStats] = useState<BrokerStats | null>(null);
  const [loading, setLoading] = useState(false);

  const periodStart = useMemo(() => {
    const days = period === "1d" ? 1 : period === "7d" ? 7 : 30;
    const d = new Date();
    d.setDate(d.getDate() - days);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, [period]);

  const fetchStats = useCallback(async () => {
    if (!brokerId) { setStats(EMPTY); return; }
    setLoading(true);
    const [callsRes, msgsRes, avaRes] = await Promise.all([
      supabase.from("planipret_phone_calls")
        .select("status, direction, duration_seconds, coaching_score, lead_temperature, has_recording, has_transcript, analyzed_at")
        .eq("user_id", brokerId)
        .gte("started_at", periodStart),
      supabase.from("planipret_phone_messages")
        .select("direction")
        .eq("user_id", brokerId)
        .gte("created_at", periodStart),
      supabase.from("planipret_ava_email_analyses")
        .select("id")
        .eq("broker_id", brokerId)
        .gte("created_at", periodStart),
    ]);

    const calls = (callsRes.data ?? []) as any[];
    const msgs = (msgsRes.data ?? []) as any[];
    const answered = calls.filter((c) => c.status !== "missed").length;
    const coach = calls.filter((c) => typeof c.coaching_score === "number");

    setStats({
      total_calls: calls.length,
      inbound: calls.filter((c) => c.direction === "inbound").length,
      outbound: calls.filter((c) => c.direction === "outbound").length,
      missed: calls.filter((c) => c.status === "missed" || c.direction === "missed").length,
      avg_duration: calls.length ? calls.reduce((a, c) => a + (c.duration_seconds || 0), 0) / calls.length : 0,
      answer_rate: calls.length ? (answered / calls.length) * 100 : 0,
      hot_leads: calls.filter((c) => c.lead_temperature === "hot").length,
      warm_leads: calls.filter((c) => c.lead_temperature === "warm").length,
      avg_coaching: coach.length ? coach.reduce((a, c) => a + c.coaching_score, 0) / coach.length : 0,
      analyzed_calls: calls.filter((c) => !!c.analyzed_at).length,
      recordings: calls.filter((c) => !!c.has_recording).length,
      sms_sent: msgs.filter((m) => m.direction === "outbound").length,
      sms_received: msgs.filter((m) => m.direction === "inbound").length,
      ava_sessions: (avaRes.data ?? []).length,
    });
    setLoading(false);
  }, [brokerId, periodStart]);

  useEffect(() => {
    fetchStats();
    if (!brokerId) return;
    const suffix = extension || brokerId;
    const ch = supabase
      .channel(`broker-stats-${suffix}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_phone_calls", filter: `user_id=eq.${brokerId}` }, () => fetchStats())
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_phone_messages", filter: `user_id=eq.${brokerId}` }, () => fetchStats())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [brokerId, extension, fetchStats]);

  return { stats: stats ?? EMPTY, loading, refetch: fetchStats };
}
