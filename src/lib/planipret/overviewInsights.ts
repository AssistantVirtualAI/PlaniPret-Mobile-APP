import { supabase } from "@/integrations/supabase/client";

export type OverviewInsight = {
  category: "performance" | "availability" | "communication" | "clients" | "revenue";
  title: string;
  finding: string;
  action: string;
  severity: "positive" | "neutral" | "warning";
  metric?: string | null;
};

type BuildArgs = {
  days: number;
  kpi: Record<string, number>;
  prev: Record<string, number>;
  daily: Array<{ label: string; inbound: number; outbound: number; missed: number; sent: number; received: number; avg: number }>;
  hourly: Array<{ hour: string; calls: number }>;
  topContacts: Array<{ peer: string; calls: number; seconds: number }>;
  commissions?: { cy: number; py: number } | null;
};

/** Anonymize a phone/contact into a short non-identifying label. */
const anon = (peer: string, i: number) => {
  const digits = String(peer ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? `Contact ${i + 1} (•••${digits.slice(-2)})` : `Contact ${i + 1}`;
};

/** Compact, PII-free payload sent to the AI. */
export function buildOverviewMetrics(a: BuildArgs) {
  const round = (v: unknown) => Math.round(Number(v ?? 0));
  return {
    period_days: a.days,
    current: {
      calls: round(a.kpi.calls),
      missed: round(a.kpi.missed),
      answer_rate_pct: round(a.kpi.answerRate),
      avg_duration_sec: round(a.kpi.avgDuration),
      sms_sent: round(a.kpi.smsSent),
      sms_received: round(a.kpi.smsReceived),
      recordings: round(a.kpi.recordings),
    },
    previous: {
      calls: round(a.prev.calls),
      missed: round(a.prev.missed),
      answer_rate_pct: round(a.prev.answerRate),
      avg_duration_sec: round(a.prev.avgDuration),
      sms_sent: round(a.prev.smsSent),
      sms_received: round(a.prev.smsReceived),
      recordings: round(a.prev.recordings),
    },
    daily: (a.daily ?? []).slice(-31).map((d) => ({
      label: d.label, in: d.inbound, out: d.outbound, missed: d.missed, sent: d.sent, received: d.received,
    })),
    hourly: (a.hourly ?? []).filter((h) => h.calls > 0).map((h) => ({ hour: h.hour, calls: h.calls })),
    top_contacts: (a.topContacts ?? []).slice(0, 5).map((c, i) => ({
      contact: anon(c.peer, i), calls: c.calls, minutes: Math.round(c.seconds / 60),
    })),
    commissions: a.commissions ? { current_year: round(a.commissions.cy), prior_year: round(a.commissions.py) } : null,
  };
}

export async function fetchOverviewInsights(opts: {
  lang: "fr" | "en";
  days: number;
  metrics: ReturnType<typeof buildOverviewMetrics>;
}): Promise<{ ok: boolean; summary: string; insights: OverviewInsight[]; error?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  const { data, error } = await supabase.functions.invoke("pp-overview-insights", {
    body: { lang: opts.lang, days: opts.days, metrics: opts.metrics },
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
  });
  if (error) return { ok: false, summary: "", insights: [], error: error.message };
  const res = (data ?? {}) as any;
  return {
    ok: Boolean(res.success),
    summary: String(res.summary ?? ""),
    insights: Array.isArray(res.insights) ? (res.insights as OverviewInsight[]) : [],
    error: res.error,
  };
}
