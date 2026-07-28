import { useEffect, useMemo, useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Phone, TrendingUp, Award, Flame, Sparkles, MessageSquare, Voicemail, Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, PieChart, Pie, Cell, Legend } from "recharts";
import type { PlanipretMobileContext } from "../PlanipretMobile";
import CoachOverlay from "@/components/planipret/ava/CoachOverlay";
import { callAva, type AvaSuggestion } from "@/services/avaProactive";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import Ms365StatsCard from "@/components/planipret/Ms365StatsCard";


type Period = "week" | "month" | "quarter";

const PRIMARY = "var(--pp-brand-accent-2)";
const ACCENT = "#2E9BDC";
const SUCCESS = "#10B981";
const DANGER = "#E84C4C";

export default function MStats() {
  const { t, lang } = useMplanipretLang();
  const { profile, openDialer, openAva } = useOutletContext<PlanipretMobileContext>();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>("week");
  const [calls, setCalls] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [voicemails, setVoicemails] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachReply, setCoachReply] = useState("");
  const [coachSuggestions, setCoachSuggestions] = useState<AvaSuggestion[]>([]);

  useEffect(() => {
    if (!profile?.user_id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      const days = period === "week" ? 7 : period === "month" ? 30 : 90;
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const profileIds = Array.from(new Set([profile.user_id, profile.id].filter(Boolean)));
      try {
        const [cRes, mRes, vRes, lRes] = await Promise.all([
          supabase.from("planipret_phone_calls").select("id,direction,status,duration_seconds,lead_score,lead_temperature,coaching_score,created_at,started_at,has_recording,analyzed_at")
            .in("user_id", profileIds).gte("started_at", since).order("started_at", { ascending: false }),
          supabase.from("planipret_phone_messages").select("id,direction,created_at,read_at")
            .in("user_id", profileIds).gte("created_at", since),
          supabase.from("planipret_voicemails").select("id,is_read,created_at,duration_seconds")
            .in("user_id", profileIds).gte("created_at", since),
          supabase.from("planipret_pipeline").select("id,stage,created_at")
            .in("user_id", profileIds).gte("created_at", since),
        ]);
        if (cancelled) return;
        if (cRes.error) throw cRes.error;
        setCalls(cRes.data ?? []);
        setMessages(mRes.data ?? []);
        setVoicemails(vRes.data ?? []);
        setLeads(lRes.data ?? []);
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message ?? "performance_unavailable");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [profile?.user_id, profile?.id, period, refreshTick]);

  const kpi = useMemo(() => {
    const total = calls.length;
    const answered = calls.filter((c) => c.status !== "missed" && (c.duration_seconds ?? 0) > 0).length;
    const avgDur = total ? Math.round(calls.reduce((s, c) => s + (c.duration_seconds ?? 0), 0) / total) : 0;
    const scored = calls.filter((c) => c.lead_score != null);
    const coach = calls.filter((c) => typeof c.coaching_score === "number");
    const avgScore = scored.length ? (scored.reduce((s, c) => s + c.lead_score, 0) / scored.length).toFixed(1) : "—";
    const avgCoach = coach.length ? Math.round(coach.reduce((s, c) => s + c.coaching_score, 0) / coach.length) : 0;
    return { total, response: total ? Math.round((answered / total) * 100) : 0, avgDur, avgScore, avgCoach };
  }, [calls]);

  const dailyData = useMemo(() => {
    const days = period === "week" ? 7 : period === "month" ? 30 : 90;
    const buckets = new Array(days).fill(0).map((_, i) => {
      const d = new Date(Date.now() - (days - 1 - i) * 86400000);
      return { label: d.toLocaleDateString(lang === "en" ? "en-CA" : "fr-CA", { weekday: "short", day: "2-digit" }), out: 0, in: 0, missed: 0, date: d.toDateString() };
    });
    for (const c of calls) {
      const dStr = new Date(c.started_at ?? c.created_at).toDateString();
      const b = buckets.find((x) => x.date === dStr); if (!b) continue;
      if (c.status === "missed" || (c.duration_seconds ?? 0) === 0) b.missed++;
      else if (c.direction === "outbound") b.out++; else b.in++;
    }
    return buckets;
  }, [calls, period, lang]);

  const donut = useMemo(() => {
    const out = calls.filter((c) => c.direction === "outbound" && c.status !== "missed").length;
    const inc = calls.filter((c) => c.direction === "inbound" && c.status !== "missed" && (c.duration_seconds ?? 0) > 0).length;
    const miss = calls.filter((c) => c.status === "missed" || (c.duration_seconds ?? 0) === 0).length;
    return [{ name: t("stats.outbound"), value: out, color: ACCENT }, { name: t("stats.inbound"), value: inc, color: SUCCESS }, { name: t("stats.missed"), value: miss, color: DANGER }];
  }, [calls, t]);

  const funnel = useMemo(() => {
    const qualified = Math.max(leads.length, calls.filter((c) => (c.lead_score ?? 0) >= 6).length);
    const inPipe = leads.filter((l) => ["proposition", "negotiation", "discovery"].includes(l.stage)).length;
    const approved = leads.filter((l) => l.stage === "won" || l.stage === "approved").length;
    return [{ label: t("home.kpi.calls"), value: kpi.total }, { label: t("stats.qualifiedLeads"), value: qualified }, { label: t("stats.inPipeline"), value: inPipe }, { label: t("stats.approved"), value: approved }];
  }, [leads, kpi.total, t]);

  const bestDay = useMemo(() => {
    const top = [...dailyData].sort((a, b) => (b.out + b.in) - (a.out + a.in))[0];
    return top ? { count: top.out + top.in, label: top.label } : null;
  }, [dailyData]);

  return (
    <div className="p-4 pb-[calc(2rem+env(safe-area-inset-bottom))] min-h-dvh overflow-y-auto">
      <header className="flex items-center gap-2 mb-4">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-full hover:bg-slate-100"><ArrowLeft className="w-5 h-5" /></button>
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--pp-text-primary)" }}>{t("stats.title")}</h1>
          <p className="text-xs text-slate-400">{profile?.full_name ?? ""} · {profile?.extension ? `Ext. ${profile.extension}` : new Date().toLocaleDateString(lang === "en" ? "en-CA" : "fr-CA", { month: "long", year: "numeric" })}</p>
        </div>
        <button onClick={() => setRefreshTick((n) => n + 1)} className="ml-auto p-2 rounded-full" style={{ background: "var(--pp-bg-elevated)", color: PRIMARY }} aria-label="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>
      </header>

      <div className="flex gap-1.5 mb-4 bg-slate-100 rounded-full p-1 text-xs">
        {(["week", "month", "quarter"] as Period[]).map((p) => (
          <button key={p} onClick={() => setPeriod(p)}
            className="flex-1 py-1.5 rounded-full font-medium transition"
            style={{ background: period === p ? "white" : "transparent", color: period === p ? PRIMARY : "#64748b", boxShadow: period === p ? "0 1px 3px rgba(0,0,0,0.1)" : "none" }}>
            {t(`stats.periods.${p}`)}
          </button>
        ))}
      </div>

      <button
        onClick={async () => {
          setCoachOpen(true);
          setCoachLoading(true);
          setCoachReply("");
          setCoachSuggestions([]);
          const res = await callAva({
            mode: "recommend",
            message: t("stats.coachPrompt").replace("{period}", t(`stats.periods.${period}`)),
            context: {
              period,
              kpi,
              funnel,
              best_day: bestDay,
              broker: profile?.full_name,
            },
          });
          setCoachReply(res.reply);
          setCoachSuggestions(res.suggestions);
          setCoachLoading(false);
        }}
        className="w-full mb-4 py-2.5 rounded-xl flex items-center justify-center gap-2 text-white font-semibold text-sm shadow-md active:scale-[0.98] transition"
        style={{ background: "linear-gradient(135deg,#2D1A5A,#9B7FE8)", boxShadow: "0 4px 16px rgba(155,127,232,0.35)" }}
      >
        <Sparkles className="w-4 h-4" /> {t("stats.coachButton")}
      </button>
      {loading && (
        <div className="mb-4 rounded-2xl p-3 flex items-center gap-2 text-xs" style={{ background: "var(--pp-bg-elevated)", color: "var(--pp-text-secondary)" }}>
          <Loader2 className="w-4 h-4 animate-spin" /> Chargement de la performance…
        </div>
      )}
      {loadError && (
        <div className="mb-4 rounded-2xl p-3 flex items-center gap-2 text-xs" style={{ background: "rgba(239,68,68,0.12)", color: "var(--pp-danger)" }}>
          <AlertCircle className="w-4 h-4" /> {loadError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mb-4">
        <Kpi label={t("stats.totalCalls")} value={kpi.total} icon={<Phone className="w-4 h-4" />} />
        <Kpi label={t("stats.responseRate")} value={`${kpi.response}%`} icon={<TrendingUp className="w-4 h-4" />} />
        <Kpi label={t("stats.avgDuration")} value={`${Math.floor(kpi.avgDur / 60)}m${kpi.avgDur % 60}s`} />
        <Kpi label={t("stats.avgScore")} value={String(kpi.avgScore)} />
        <Kpi label="Textos" value={`${messages.filter((m) => m.direction === "outbound").length}/${messages.filter((m) => m.direction === "inbound").length}`} icon={<MessageSquare className="w-4 h-4" />} />
        <Kpi label="Voicemail" value={voicemails.length} icon={<Voicemail className="w-4 h-4" />} />
      </div>

      <Ms365StatsCard days={period === "week" ? 7 : period === "month" ? 30 : 90} />


      <div className="bg-white rounded-2xl p-3 mb-4 shadow-sm">
        <div className="text-xs font-semibold text-slate-500 mb-2">{t("stats.callsPerDay")}</div>
        <div style={{ width: "100%", height: 180 }}>
          <ResponsiveContainer>
            <BarChart data={dailyData}>
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="out" stackId="a" fill={ACCENT} />
              <Bar dataKey="in" stackId="a" fill={SUCCESS} />
              <Bar dataKey="missed" stackId="a" fill={DANGER} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-3 mb-4 shadow-sm">
        <div className="text-xs font-semibold text-slate-500 mb-2">{t("stats.breakdown")}</div>
        <div style={{ width: "100%", height: 180 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={donut} dataKey="value" innerRadius={40} outerRadius={70} paddingAngle={2}>
                {donut.map((d) => <Cell key={d.name} fill={d.color} />)}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-3 mb-4 shadow-sm">
        <div className="text-xs font-semibold text-slate-500 mb-2">{t("stats.leadConversion")}</div>
        {funnel.map((f, i) => {
          const max = funnel[0].value || 1;
          const w = Math.max(15, (f.value / max) * 100);
          return (
            <div key={i} className="mb-2">
              <div className="flex justify-between text-xs mb-0.5"><span className="text-slate-600">{f.label}</span><span className="font-semibold">{f.value}</span></div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${w}%`, background: `linear-gradient(90deg, ${PRIMARY}, ${ACCENT})` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-2">
        {bestDay && (
          <div className="bg-white rounded-xl p-3 flex items-center gap-3 shadow-sm">
            <Award className="w-6 h-6 text-amber-500" />
            <div className="text-sm">🏆 {t("stats.bestDay")}: <strong>{bestDay.count} {t("stats.calls")}</strong> {lang === "fr" ? "le" : "on"} {bestDay.label}</div>
          </div>
        )}
        <div className="bg-white rounded-xl p-3 flex items-center gap-3 shadow-sm">
          <Flame className="w-6 h-6 text-orange-500" />
          <div className="text-sm">⚡ {t("stats.solidPerformance")} {period === "week" ? t("stats.weekSuffix") : period === "quarter" ? t("stats.quarterSuffix") : t("stats.monthSuffix")}</div>
        </div>
      </div>

      <CoachOverlay
        open={coachOpen}
        title="Coach AVA"
        subtitle={coachLoading ? t("stats.analyzing") : coachReply}
        suggestions={coachSuggestions}
        ctx={{ openDialer, openAva, userId: profile?.user_id }}
        onClose={() => setCoachOpen(false)}
      />
    </div>
  );
}

function Kpi({ label, value, icon }: { label: string; value: any; icon?: any }) {
  return (
    <div className="bg-white rounded-xl p-3 shadow-sm">
      <div className="text-xs text-slate-500 flex items-center gap-1.5">{icon} {label}</div>
      <div className="text-xl font-bold mt-1" style={{ color: PRIMARY }}>{value}</div>
    </div>
  );
}
