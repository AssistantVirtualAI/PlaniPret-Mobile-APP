import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { callPeer, msgPeer } from "@/lib/planipret/brokerFormat";

export type OvDaily = { date: string; label: string; inbound: number; outbound: number; missed: number; sent: number; received: number; avg: number; recorded: number; transcribed: number; analyzed: number };
export type OvHour = { hour: string; calls: number };
export type OvRecWeek = { label: string; recorded: number; transcribed: number; analyzed: number };
export type OvContact = { peer: string; calls: number; seconds: number };

export type OvKpi = {
  calls: number; missed: number; answerRate: number; avgDuration: number;
  smsSent: number; smsReceived: number; recordings: number;
};

const EMPTY_KPI: OvKpi = { calls: 0, missed: 0, answerRate: 0, avgDuration: 0, smsSent: 0, smsReceived: 0, recordings: 0 };

const dayKey = (v: string) => new Date(v).toISOString().slice(0, 10);
const isMissed = (c: any) => c.status === "missed" || c.direction === "missed";

function kpiOf(calls: any[], msgs: any[]): OvKpi {
  const answered = calls.filter((c) => !isMissed(c)).length;
  const durations = calls.map((c) => Number(c.duration_seconds ?? 0));
  return {
    calls: calls.length,
    missed: calls.filter(isMissed).length,
    answerRate: calls.length ? (answered / calls.length) * 100 : 0,
    avgDuration: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
    smsSent: msgs.filter((m) => m.direction === "outbound").length,
    smsReceived: msgs.filter((m) => m.direction === "inbound").length,
    recordings: calls.filter((c) => !!c.has_recording).length,
  };
}

/**
 * Aggregates a broker's telephony activity for the overview dashboard.
 * `userId` is the broker id supplied by the portal layout (never from the URL).
 */
export function useBrokerOverview(userId: string, days: number, lang: "fr" | "en" = "fr") {
  const [loading, setLoading] = useState(true);
  const [calls, setCalls] = useState<any[]>([]);
  const [msgs, setMsgs] = useState<any[]>([]);
  const [vmUnread, setVmUnread] = useState(0);

  const since = useMemo(() => new Date(Date.now() - days * 864e5), [days]);
  const sincePrev = useMemo(() => new Date(Date.now() - 2 * days * 864e5), [days]);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const [callsRes, msgsRes, vmRes] = await Promise.all([
      supabase.from("planipret_phone_calls")
        .select("id, direction, status, duration_seconds, has_recording, has_transcript, analyzed_at, ai_summary, from_number, to_number, from_name, to_name, created_at")
        .eq("user_id", userId).gte("created_at", sincePrev.toISOString())
        .order("created_at", { ascending: true }).limit(1000),
      supabase.from("planipret_phone_messages")
        .select("id, direction, body, from_number, to_number, read_at, created_at")
        .eq("user_id", userId).gte("created_at", sincePrev.toISOString())
        .order("created_at", { ascending: true }).limit(1000),
      supabase.from("planipret_voicemails").select("id", { count: "exact", head: true })
        .eq("user_id", userId).eq("is_read", false),
    ]);
    setCalls((callsRes.data as any[]) ?? []);
    setMsgs((msgsRes.data as any[]) ?? []);
    setVmUnread(vmRes.count ?? 0);
    setLoading(false);
  }, [userId, sincePrev]);

  useEffect(() => { void load(); }, [load]);

  const data = useMemo(() => {
    const inWindow = (r: any) => new Date(r.created_at) >= since;
    const curCalls = calls.filter(inWindow);
    const prevCalls = calls.filter((r) => !inWindow(r));
    const curMsgs = msgs.filter(inWindow);
    const prevMsgs = msgs.filter((r) => !inWindow(r));

    const buckets = new Map<string, OvDaily>();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 864e5);
      const key = d.toISOString().slice(0, 10);
      buckets.set(key, {
        date: key,
        label: d.toLocaleDateString(lang === "en" ? "en-CA" : "fr-CA", { day: "2-digit", month: "short" }),
        inbound: 0, outbound: 0, missed: 0, sent: 0, received: 0, avg: 0, recorded: 0, transcribed: 0, analyzed: 0,
      });
    }
    const durAcc = new Map<string, { t: number; n: number }>();
    for (const c of curCalls) {
      const b = buckets.get(dayKey(c.created_at)); if (!b) continue;
      if (isMissed(c)) b.missed++; else if (c.direction === "outbound") b.outbound++; else b.inbound++;
      if (c.has_recording) b.recorded++;
      if (c.has_transcript) b.transcribed++;
      if (c.analyzed_at) b.analyzed++;
      const acc = durAcc.get(b.date) ?? { t: 0, n: 0 };
      acc.t += Number(c.duration_seconds ?? 0); acc.n++; durAcc.set(b.date, acc);
    }
    for (const m of curMsgs) {
      const b = buckets.get(dayKey(m.created_at)); if (!b) continue;
      if (m.direction === "outbound") b.sent++; else b.received++;
    }
    const daily = Array.from(buckets.values()).map((b) => {
      const acc = durAcc.get(b.date);
      return { ...b, avg: acc && acc.n ? Math.round(acc.t / acc.n / 60 * 10) / 10 : 0 };
    });

    const hourly: OvHour[] = Array.from({ length: 24 }, (_, h) => ({ hour: `${String(h).padStart(2, "0")}h`, calls: 0 }));
    for (const c of curCalls) hourly[new Date(c.created_at).getHours()].calls++;

    const weeks = new Map<string, OvRecWeek>();
    for (const c of curCalls) {
      const d = new Date(c.created_at);
      const monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay() + 6) % 7)); monday.setHours(0, 0, 0, 0);
      const key = monday.toISOString().slice(0, 10);
      const w = weeks.get(key) ?? {
        label: monday.toLocaleDateString(lang === "en" ? "en-CA" : "fr-CA", { day: "2-digit", month: "short" }),
        recorded: 0, transcribed: 0, analyzed: 0,
      };
      if (c.has_recording) w.recorded++;
      if (c.has_transcript) w.transcribed++;
      if (c.analyzed_at) w.analyzed++;
      weeks.set(key, w);
    }
    const recWeeks = Array.from(weeks.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([, w]) => w);

    const contacts = new Map<string, OvContact>();
    for (const c of curCalls) {
      const peer = callPeer(c) || "—";
      const e = contacts.get(peer) ?? { peer, calls: 0, seconds: 0 };
      e.calls++; e.seconds += Number(c.duration_seconds ?? 0);
      contacts.set(peer, e);
    }
    const topContacts = Array.from(contacts.values()).sort((a, b) => b.calls - a.calls).slice(0, 5);

    const kpi = kpiOf(curCalls, curMsgs);
    const prev = kpiOf(prevCalls, prevMsgs);

    const recentCalls = [...curCalls].reverse().slice(0, 10);
    const recentMsgs = [...curMsgs].reverse().slice(0, 5).map((m) => ({ ...m, peer: msgPeer(m) }));

    const split = [
      { key: "inbound", value: curCalls.filter((c) => !isMissed(c) && c.direction === "inbound").length },
      { key: "outbound", value: curCalls.filter((c) => !isMissed(c) && c.direction === "outbound").length },
      { key: "missed", value: kpi.missed },
    ];

    return { kpi, prev, daily, hourly, recWeeks, topContacts, recentCalls, recentMsgs, split };
  }, [calls, msgs, days, since, lang]);

  return { loading, vmUnread, refetch: load, ...data, kpi: data.kpi ?? EMPTY_KPI };
}
