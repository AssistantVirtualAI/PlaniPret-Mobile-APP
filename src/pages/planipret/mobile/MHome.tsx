import { useEffect, useMemo, useState } from "react";
import IdentityCard from "@/components/planipret/mobile/IdentityCard";
import { useOutletContext, useNavigate } from "react-router-dom";

import { supabase } from "@/integrations/supabase/client";
import {
  Phone, PhoneMissed, MessageSquare, Voicemail,
  ArrowDownLeft, ArrowUpRight, X, Calendar, Headphones, Bot,
  BellOff, Flame, Sparkles, ChevronRight, Mail, Users as UsersIcon,
  CheckSquare, RefreshCw, AlertCircle,
} from "lucide-react";
import type { PlanipretMobileContext } from "../PlanipretMobile";
import { toast } from "sonner";
import PWAInstallBanner from "@/components/planipret/PWAInstallBanner";
import ExtensionSyncBanner from "@/components/planipret/mobile/ExtensionSyncBanner";
import PermissionBanners from "@/components/planipret/mobile/PermissionBanners";
import { TEMP_EMOJI } from "@/components/planipret/leadHelpers";
import { useMaestroPipelineToasts } from "@/hooks/useMaestroPipelineToasts";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

type Period = "day" | "week" | "month" | "shift";

function periodRange(period: Period) {
  const now = new Date();
  const since = new Date(now);
  if (period === "day") since.setHours(0, 0, 0, 0);
  else if (period === "week") since.setDate(since.getDate() - 7);
  else if (period === "month") since.setMonth(since.getMonth() - 1);
  else if (period === "shift") since.setHours(Math.max(0, now.getHours() - 4), 0, 0, 0);
  return { sinceIso: since.toISOString(), untilIso: now.toISOString() };
}

function Shimmer({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded ${className}`} style={{ background: "#E2E8F0" }} />;
}

export default function MHome() {
  const { t, lang } = useMplanipretLang();
  const { profile, registerRefresh, openDialer, openAva, reloadProfile } =
    useOutletContext<PlanipretMobileContext>();
  const navigate = useNavigate();

  const [period, setPeriod] = useState<Period>(() => {
    try { return (localStorage.getItem("pp.mobile.period") as Period) || "day"; } catch { return "day"; }
  });
  useEffect(() => { try { localStorage.setItem("pp.mobile.period", period); } catch {} }, [period]);

  const [stats, setStats] = useState({ calls: 0, missed: 0, sms: 0, voicemails: 0, meetings: 0, hotLeads: 0, tasks: 0, outbound: 0 });
  const [recent, setRecent] = useState<any[]>([]);
  const [hotLeads, setHotLeads] = useState<any[]>([]);
  const [dueReminders, setDueReminders] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [brief, setBrief] = useState<any | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefErr, setBriefErr] = useState<string | null>(null);

  useMaestroPipelineToasts(profile?.user_id);

  const periodLabel: Record<Period, string> = {
    day: t("home.period.day"),
    week: t("home.period.week"),
    month: t("home.period.month"),
    shift: t("home.period.shift"),
  };

  const dateLabel = new Date().toLocaleDateString(lang === "en" ? "en-CA" : "fr-CA", {
    weekday: "long", day: "numeric", month: "long",
  });
  const firstName = (profile?.full_name ?? t("home.broker")).split(" ")[0];

  const loadStats = async () => {
    if (!profile) return;
    setStatsLoading(true);
    const { sinceIso, untilIso } = periodRange(period);
    const nowIso = new Date().toISOString();
    const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7);

    const [callsRes, missedRes, smsRes, vmRes, recentRes, hotRes, remRes, outboundRes, meetingsRes, hotCountRes, tasksCountRes] = await Promise.all([
      supabase.from("planipret_phone_calls").select("id", { count: "exact", head: true })
        .eq("user_id", profile.user_id).gte("started_at", sinceIso).lte("started_at", untilIso),
      supabase.from("planipret_phone_calls").select("id", { count: "exact", head: true })
        .eq("user_id", profile.user_id).eq("direction", "missed").gte("started_at", sinceIso).lte("started_at", untilIso),
      supabase.from("planipret_phone_messages").select("id", { count: "exact", head: true })
        .eq("user_id", profile.user_id).is("read_at", null).eq("direction", "inbound"),
      supabase.from("planipret_voicemails").select("id", { count: "exact", head: true })
        .eq("user_id", profile.user_id).eq("is_read", false).eq("folder", "inbox"),
      supabase.from("planipret_phone_calls")
        .select("id, direction, from_number, from_name, to_number, to_name, started_at, lead_score, lead_temperature, ai_summary")
        .eq("user_id", profile.user_id).order("started_at", { ascending: false }).limit(5),
      supabase.from("planipret_phone_calls")
        .select("id, from_number, from_name, to_number, to_name, lead_score, lead_temperature, started_at, direction")
        .eq("user_id", profile.user_id).gte("started_at", sinceIso).gte("lead_score", 7)
        .order("lead_score", { ascending: false }).limit(5),
      supabase.from("planipret_reminders").select("*")
        .eq("user_id", profile.user_id).eq("status", "pending").lte("scheduled_at", nowIso)
        .order("scheduled_at", { ascending: true }).limit(10),
      supabase.from("planipret_phone_messages").select("id", { count: "exact", head: true })
        .eq("user_id", profile.user_id).eq("direction", "outbound").gte("created_at", sinceIso),
      supabase.from("appointments")
        .select("id, title, start_time, attendee_name, location_type, meeting_url")
        .eq("host_user_id", profile.user_id).gte("start_time", new Date().toISOString()).lte("start_time", weekEnd.toISOString())
        .order("start_time", { ascending: true }).limit(5),
      supabase.from("planipret_phone_calls").select("id", { count: "exact", head: true })
        .eq("user_id", profile.user_id).gte("lead_score", 7).gte("started_at", sinceIso).lte("started_at", untilIso),
      supabase.from("planipret_reminders").select("id", { count: "exact", head: true })
        .eq("user_id", profile.user_id).eq("status", "pending"),
    ]);

    setStats({
      calls: callsRes.count ?? 0,
      missed: missedRes.count ?? 0,
      sms: smsRes.count ?? 0,
      voicemails: vmRes.count ?? 0,
      meetings: (meetingsRes.data ?? []).length,
      hotLeads: hotCountRes.count ?? 0,
      tasks: tasksCountRes.count ?? 0,
      outbound: outboundRes.count ?? 0,
    });
    setRecent(recentRes.data ?? []);
    setHotLeads(hotRes.data ?? []);
    setDueReminders(remRes.data ?? []);
    setMeetings(meetingsRes.data ?? []);
    setStatsLoading(false);
  };

  const loadBrief = async (force = false) => {
    setBriefLoading(true);
    setBriefErr(null);
    const { data, error } = await supabase.functions.invoke("pp-ava-brief", { body: { period, force } });
    setBriefLoading(false);
    if (error || (data as any)?.error) {
      setBriefErr((data as any)?.error || error?.message || "brief unavailable");
      return;
    }
    setBrief(data);
  };

  useEffect(() => { loadStats(); loadBrief(false); /* eslint-disable-next-line */ }, [profile?.user_id, period]);
  useEffect(() => {
    registerRefresh(async () => { await Promise.all([loadStats(), loadBrief(true)]); });
    return () => registerRefresh(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.user_id, period]);

  // Realtime: refresh KPIs when new calls / messages / voicemails land for this broker.
  useEffect(() => {
    if (!profile?.user_id) return;
    const uid = profile.user_id;
    const ch = supabase
      .channel(`mhome-live-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_phone_calls", filter: `user_id=eq.${uid}` }, () => loadStats())
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_phone_messages", filter: `user_id=eq.${uid}` }, () => loadStats())
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_voicemails", filter: `user_id=eq.${uid}` }, () => loadStats())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.user_id, period]);

  const handleSuggestion = (sug: { kind: string; number?: string; label: string }) => {
    if (sug.kind === "call" && sug.number) { openDialer(sug.number); return; }
    if (sug.kind === "sms") { navigate("/mplanipret/messages"); return; }
    if (sug.kind === "reminder") { navigate("/mplanipret/contacts"); return; }
    toast.info(sug.label);
  };

  const totalComms = useMemo(() => stats.calls + stats.sms + stats.outbound, [stats]);
  // REST-only calls: the browser controls NS-API, the physical mobile device handles audio.
  const phoneOnline = !!profile?.extension;

  return (
    <div className="p-4 space-y-4 pb-8" style={{ background: "var(--pp-bg-base)", minHeight: "100%" }}>
      <PWAInstallBanner />
      <PermissionBanners />
      <ExtensionSyncBanner profile={profile} reloadProfile={reloadProfile} />

      {/* ===== HEADER ===== */}
      <header className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="pp-eyebrow">{dateLabel}</p>
          <h1 className="text-[26px] leading-tight font-bold mt-0.5">
            {t("home.hello")}, <span style={{ color: "var(--pp-brand-accent)" }}>{firstName}</span>
          </h1>
        </div>
        <button
          onClick={() => {
            if (phoneOnline) toast.success("Appels REST prêts — votre téléphone mobile sonnera quand vous appellerez.");
            else toast.error("Aucune extension NetSapiens liée. Contacte un admin pour la synchroniser.");
          }}
          className="pp-pill"
          style={{
            background: phoneOnline ? "rgba(13,122,95,0.10)" : "rgba(178,58,72,0.10)",
            color: phoneOnline ? "var(--pp-success)" : "var(--pp-danger)",
            border: `1px solid ${phoneOnline ? "rgba(13,122,95,0.30)" : "rgba(178,58,72,0.30)"}`,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: 999, background: "currentColor", boxShadow: "0 0 6px currentColor" }} />
          {phoneOnline ? "Appels REST" : "Non lié"}
        </button>
      </header>

      <IdentityCard profile={profile} onLinked={reloadProfile} />



      {/* ===== PERIOD FILTER ===== */}
      <div className="flex items-center justify-between">
        <div className="pp-segmented">
          {(["day","week","month","shift"] as Period[]).map((p) => (
            <button key={p} onClick={() => setPeriod(p)} className={period === p ? "is-active" : ""}>
              {periodLabel[p]}
            </button>
          ))}
        </div>
        <span className="text-[11px]" style={{ color: "var(--pp-text-muted)" }}>
          {totalComms} comms
        </span>
      </div>

      {/* ===== DND BANNER ===== */}
      {profile?.dnd_enabled && (
        <div className="rounded-2xl p-3 flex items-center gap-3"
          style={{ background: "rgba(178,58,72,0.08)", border: "1px solid rgba(178,58,72,0.30)" }}>
          <BellOff className="w-5 h-5" style={{ color: "var(--pp-danger)" }} />
          <div className="flex-1 min-w-0">
              <div className="text-xs font-bold" style={{ color: "var(--pp-danger)" }}>{t("home.dndTitle")}</div>
              <div className="text-[11px]" style={{ color: "var(--pp-text-secondary)" }}>{t("home.dndSub")}</div>
          </div>
          <button
            onClick={async () => {
              await supabase.from("planipret_profiles").update({ dnd_enabled: false }).eq("user_id", profile.user_id);
              await reloadProfile();
              toast.success(t("home.dndDisabled"));
            }}
            className="text-[11px] font-semibold px-2.5 py-1 rounded-md text-white"
            style={{ background: "var(--pp-danger)" }}>
            {t("home.disable")}
          </button>
        </div>
      )}

      {/* ===== AI BRIEF (Navy gradient) ===== */}
      <section
        className="rounded-2xl p-4 relative overflow-hidden pp-card"
        style={{
          background: "linear-gradient(135deg, #FFFFFF 0%, #F0F4F9 100%)",
          borderColor: "var(--pp-bg-border)",
        }}
      >
        <div
          className="absolute -top-12 -right-12 w-40 h-40 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(59,111,160,0.18), transparent 70%)" }}
        />
        <div className="relative">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" style={{ color: "var(--pp-brand-accent)" }} />
              <span className="pp-eyebrow">{t("home.brief")} — {periodLabel[period]}</span>
            </div>
            <button
              onClick={() => loadBrief(true)}
              disabled={briefLoading}
              className="text-[11px] px-2.5 py-1 rounded-full flex items-center gap-1 disabled:opacity-50"
              style={{
                background: "rgba(59,111,160,0.10)",
                color: "var(--pp-brand-accent-2)",
                border: "1px solid rgba(59,111,160,0.25)",
                fontFamily: "Urbanist,sans-serif", fontWeight: 600,
              }}>
              <RefreshCw className={`w-3 h-3 ${briefLoading ? "animate-spin" : ""}`} />
              {briefLoading ? "…" : t("home.regenerate")}
            </button>
          </div>

          {briefLoading && !brief ? (
            <div className="space-y-2">
              <Shimmer className="h-4 w-3/4" />
              <Shimmer className="h-3 w-full" />
              <Shimmer className="h-3 w-2/3" />
            </div>
          ) : briefErr ? (
            <div className="text-xs flex items-center gap-2" style={{ color: "var(--pp-danger)" }}>
              <AlertCircle className="w-3.5 h-3.5" /> {briefErr}
            </div>
          ) : brief ? (
            <>
              <p className="text-[15px] font-semibold leading-snug" style={{ color: "var(--pp-text-primary)", fontFamily: "Urbanist,sans-serif" }}>
                {brief.headline}
              </p>
              {brief.priorities?.length > 0 && (
                <ol className="mt-3 space-y-1.5">
                  {brief.priorities.slice(0, 5).map((p: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-[13px]" style={{ color: "var(--pp-text-secondary)" }}>
                      <span
                        className="mt-[2px] inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold flex-shrink-0"
                        style={{ background: "var(--pp-brand-accent-2)", color: "#fff", fontFamily: "Urbanist,sans-serif" }}>
                        {i + 1}
                      </span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ol>
              )}
              {brief.risks?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {brief.risks.map((r: string, i: number) => (
                    <span key={i} className="pp-pill pp-pill-warning">⚠ {r}</span>
                  ))}
                </div>
              )}
              {brief.suggestions?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {brief.suggestions.map((s: any, i: number) => (
                    <button key={i} onClick={() => handleSuggestion(s)}
                      className="pp-pill pp-pill-accent active:scale-95 transition">
                      {s.kind === "call" ? "📞" : s.kind === "sms" ? "💬" : s.kind === "email" ? "✉" : "⏰"} {s.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-xs" style={{ color: "var(--pp-text-muted)" }}>{t("home.preparingBrief")}</p>
          )}

          {profile?.voice_agent_enabled && (
            <button onClick={openAva}
              className="mt-3 w-full py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
              style={{
                background: "rgba(108,92,231,0.10)",
                border: "1px solid rgba(108,92,231,0.30)",
                color: "var(--pp-agent)",
                fontFamily: "Urbanist,sans-serif",
              }}>
              <Headphones className="w-3.5 h-3.5" /> {t("home.listenWithAva")}
            </button>
          )}
        </div>
      </section>

      {/* ===== STATS GRID (6 KPI) ===== */}
      <section className="grid grid-cols-3 gap-2.5">
        {statsLoading ? (
          <>{[0,1,2,3,4,5].map((i) => <Shimmer key={i} className="h-[88px]" />)}</>
        ) : (
          <>
            <Kpi icon={<Phone className="w-3.5 h-3.5" />} value={stats.calls} label={t("home.kpi.calls")} accent="var(--pp-brand-accent)" onClick={() => navigate("/mplanipret/calls")} />
            <Kpi icon={<PhoneMissed className="w-3.5 h-3.5" />} value={stats.missed} label={t("home.kpi.missed")} accent="var(--pp-danger)" pulse={stats.missed > 0} onClick={() => navigate("/mplanipret/calls?tab=missed")} />
            <Kpi icon={<MessageSquare className="w-3.5 h-3.5" />} value={stats.sms} label={t("home.kpi.sms")} accent="var(--pp-success)" onClick={() => navigate("/mplanipret/messages")} />
            <Kpi icon={<Calendar className="w-3.5 h-3.5" />} value={stats.meetings} label={t("home.kpi.meetings")} accent="var(--pp-brand-accent-2)" />
            <Kpi icon={<Flame className="w-3.5 h-3.5" />} value={stats.hotLeads} label={t("home.kpi.hotLeads")} accent="#C9582A" />
            <Kpi icon={<CheckSquare className="w-3.5 h-3.5" />} value={stats.tasks} label={t("home.kpi.tasks")} accent="var(--pp-agent)" />
            <Kpi icon={<Voicemail className="w-3.5 h-3.5" />} value={stats.voicemails} label={t("home.kpi.voicemails")} accent="#6C5CE7" onClick={() => navigate("/mplanipret/voicemail")} />
            <Kpi icon={<Mail className="w-3.5 h-3.5" />} value={stats.outbound} label={t("home.kpi.sent")} accent="#7A8FB0" />
            <Kpi icon={<UsersIcon className="w-3.5 h-3.5" />} value={totalComms} label={t("home.kpi.total")} accent="var(--pp-brand-accent-2)" />
          </>
        )}
      </section>

      {/* ===== HOT LEADS ===== */}
      {hotLeads.length > 0 && (
        <section className="pp-card p-4">
          <SectionHead icon={<Flame className="w-4 h-4" style={{ color: "#C9582A" }} />} title={t("home.hotLeads")} count={hotLeads.length} />
          <ul className="space-y-1.5">
            {hotLeads.map((l) => {
              const name = l.from_name || l.from_number || l.to_name || l.to_number;
              const phone = l.from_number || l.to_number;
              return (
                <li key={l.id} className="flex items-center gap-3 py-2 px-2 rounded-lg"
                  style={{ background: "rgba(201,88,42,0.05)" }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: "var(--pp-text-primary)" }}>{name ?? "—"}</p>
                    <p className="text-[11px]" style={{ color: "var(--pp-text-muted)" }}>
                      {TEMP_EMOJI.hot} {t("home.score")} {l.lead_score}/10
                    </p>
                  </div>
                  <button onClick={() => openDialer(phone ?? undefined)}
                    className="text-[11px] font-semibold px-3 py-1.5 rounded-lg text-white"
                    style={{ background: "#C9582A", fontFamily: "Urbanist,sans-serif" }}>
                    {t("common.callBack")}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ===== MEETINGS ===== */}
      <section className="pp-card p-4">
        <SectionHead icon={<Calendar className="w-4 h-4" style={{ color: "var(--pp-brand-accent)" }} />} title={t("home.upcomingMeetings")} count={meetings.length} />
        {statsLoading ? (
          <div className="space-y-2"><Shimmer className="h-10" /><Shimmer className="h-10" /></div>
        ) : meetings.length === 0 ? (
          <p className="text-xs text-center py-3" style={{ color: "var(--pp-text-muted)" }}>
            {t("home.noMeetings")}
          </p>
        ) : (
          <ul className="space-y-2">
            {meetings.map((m) => {
              const meetingDate = m.start_time ? new Date(m.start_time) : null;
              return (
                <li key={m.id} className="flex items-center gap-3 py-2">
                  <div className="px-2.5 py-1.5 rounded-lg text-xs font-bold tabular-nums"
                    style={{ background: "rgba(59,111,160,0.10)", color: "var(--pp-brand-accent-2)", border: "1px solid rgba(59,111,160,0.25)", fontFamily: "Urbanist,sans-serif" }}>
                    {meetingDate ? meetingDate.toLocaleDateString(lang === "en" ? "en-CA" : "fr-CA", { day: "2-digit", month: "short" }) : "—"}
                    {" "}
                    {meetingDate ? meetingDate.toLocaleTimeString(lang === "en" ? "en-CA" : "fr-CA", { hour: "2-digit", minute: "2-digit" }) : ""}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate font-medium" style={{ color: "var(--pp-text-primary)" }}>{m.title ?? t("home.untitled")}</p>
                    {m.attendee_name && (
                      <p className="text-[11px] truncate" style={{ color: "var(--pp-text-muted)" }}>{m.attendee_name}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ===== TASKS / REMINDERS ===== */}
      {dueReminders.length > 0 && (
        <section className="pp-card p-4">
          <SectionHead icon={<CheckSquare className="w-4 h-4" style={{ color: "var(--pp-agent)" }} />} title={t("home.tasksDue")} count={dueReminders.length} />
          <ul className="space-y-1.5">
            {dueReminders.map((r) => (
              <li key={r.id} className="flex items-center gap-2 py-2 px-2 rounded-lg"
                style={{ background: "#F7F9FC" }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: "var(--pp-text-primary)" }}>
                    {r.contact_name ?? r.contact_number ?? "—"}
                  </p>
                  {r.note && <p className="text-[11px] truncate" style={{ color: "var(--pp-text-muted)" }}>{r.note}</p>}
                </div>
                {r.contact_number && (
                  <button onClick={() => openDialer(r.contact_number)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
                    style={{ background: "var(--pp-brand-accent)" }}>
                    <Phone className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={async () => {
                    await supabase.from("planipret_reminders").update({ status: "done" }).eq("id", r.id);
                    loadStats();
                  }}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
                  style={{ background: "#fff", border: "1px solid var(--pp-bg-border)", color: "var(--pp-success)" }}>
                  ✓
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ===== RECENT CALLS ===== */}
      <section className="pp-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold pp-heading">{t("home.recentCalls")}</h2>
          <button onClick={() => navigate("/mplanipret/calls")}
            className="text-[11px] flex items-center gap-0.5" style={{ color: "var(--pp-brand-accent)" }}>
            {t("home.seeAll")} <ChevronRight className="w-3 h-3" />
          </button>
        </div>
        {statsLoading ? (
          <div className="space-y-2">{[0,1,2].map((i) => <Shimmer key={i} className="h-10" />)}</div>
        ) : recent.length === 0 ? (
          <p className="text-sm py-4 text-center" style={{ color: "var(--pp-text-muted)" }}>{t("home.noCalls")}</p>
        ) : (
          <ul className="space-y-1">
            {recent.map((c) => {
              const inbound = c.direction === "inbound";
              const missed = c.direction === "missed";
              const Icon = missed ? X : inbound ? ArrowDownLeft : ArrowUpRight;
              const color = missed ? "var(--pp-danger)" : inbound ? "var(--pp-brand-accent)" : "var(--pp-success)";
              const name = inbound || missed ? (c.from_name || c.from_number) : (c.to_name || c.to_number);
              const phone = inbound || missed ? c.from_number : c.to_number;
              return (
                <li key={c.id}
                  className="flex items-center gap-3 py-2.5 px-2 rounded-lg active:opacity-70"
                  onClick={() => openDialer(phone ?? undefined)}>
                  <span className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: "#F0F4F9", color }}>
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate flex items-center gap-1.5" style={{ color: "var(--pp-text-primary)" }}>
                      {name ?? t("common.unknown")}
                      {c.ai_summary && (
                        <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold"
                          style={{ background: "rgba(108,92,231,0.10)", color: "var(--pp-agent)", border: "1px solid rgba(108,92,231,0.30)", fontFamily: "Urbanist,sans-serif" }}>
                          🤖 {t("home.ai")}
                        </span>
                      )}
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--pp-text-muted)" }}>
                      {c.started_at ? new Date(c.started_at).toLocaleTimeString(lang === "en" ? "en-CA" : "fr-CA", { hour: "2-digit", minute: "2-digit" }) : ""}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function SectionHead({ icon, title, count }: { icon: React.ReactNode; title: string; count?: number }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-semibold flex items-center gap-1.5 pp-heading">{icon} {title}</h2>
      {count != null && <span className="pp-eyebrow">{count}</span>}
    </div>
  );
}

function Kpi({ icon, value, label, accent, pulse, onClick }: {
  icon: React.ReactNode; value: number; label: string; accent: string; pulse?: boolean; onClick?: () => void;
}) {
  return (
    <button onClick={onClick} disabled={!onClick}
      className="rounded-2xl p-3 relative overflow-hidden text-left active:scale-[0.97] transition disabled:active:scale-100"
      style={{
        background: "var(--pp-bg-surface)",
        border: "1px solid var(--pp-bg-border)",
        boxShadow: "var(--pp-shadow-sm)",
      }}>
      <div className="absolute top-0 left-0 right-0 h-[2px]"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)`, opacity: 0.7 }} />
      <div className="flex items-center justify-between mb-1.5">
        <span className="w-6 h-6 rounded-md flex items-center justify-center"
          style={{ background: `${accent}1A`, color: accent }}>{icon}</span>
        {pulse && value > 0 && (
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--pp-danger)", boxShadow: "0 0 6px var(--pp-danger)" }} />
        )}
      </div>
      <div className="text-xl font-bold tabular-nums pp-kpi" style={{ color: "var(--pp-text-primary)" }}>{value}</div>
      <div className="text-[9.5px] uppercase tracking-wider mt-0.5"
        style={{ color: "var(--pp-text-muted)", fontFamily: "Urbanist,sans-serif", fontWeight: 600, letterSpacing: "0.10em" }}>
        {label}
      </div>
    </button>
  );
}
