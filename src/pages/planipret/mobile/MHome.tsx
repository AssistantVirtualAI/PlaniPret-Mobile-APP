import { useEffect, useMemo, useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";

import { supabase } from "@/integrations/supabase/client";
import {
  Phone, PhoneMissed, MessageSquare, Voicemail,
  ArrowDownLeft, ArrowUpRight, X, Calendar, Headphones, Bot,
  BellOff, Flame, Sparkles, ChevronRight, ChevronLeft, Mail, Users as UsersIcon,
  CheckSquare, RefreshCw, AlertCircle, Video, ExternalLink,
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
const DEFAULT_PERIOD: Period = "month";

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

const pickHome = (raw: any, keys: string[]) => {
  for (const k of keys) {
    const v = raw?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return null;
};

const nsCallTime = (c: any) => String(pickHome(c, ["started_at", "start_time", "created_at", "timestamp", "time", "call-start-datetime", "call-start-time"]) ?? new Date().toISOString());
const nsCallDirection = (c: any) => {
  const raw = String(pickHome(c, ["direction", "call_direction", "call-direction", "type", "call-type"]) ?? "").toLowerCase();
  const status = String(pickHome(c, ["status", "disposition", "result"]) ?? "").toLowerCase();
  const unanswered = c?.answered === false || ["missed", "no-answer", "unanswered", "busy"].includes(status);
  if (raw.includes("out") || raw === "placed") return "outbound";
  return unanswered ? "missed" : "inbound";
};
const nsSmsUnread = (thread: any) => {
  const n = pickHome(thread, ["unread", "unread_count"]);
  if (typeof n === "number") return n;
  const status = String(pickHome(thread, ["messagesession-last-status", "status"]) ?? "").toLowerCase();
  return status && status !== "read" ? 1 : 0;
};

export default function MHome() {
  const { t, lang } = useMplanipretLang();
  const { profile, registerRefresh, openDialer, openAva, reloadProfile } =
    useOutletContext<PlanipretMobileContext>();
  const navigate = useNavigate();

  const [period, setPeriod] = useState<Period>(() => {
    try {
      const saved = localStorage.getItem("pp.mobile.period.v2") as Period | null;
      return saved && ["day", "week", "month", "shift"].includes(saved) ? saved : DEFAULT_PERIOD;
    } catch { return DEFAULT_PERIOD; }
  });
  useEffect(() => { try { localStorage.setItem("pp.mobile.period.v2", period); } catch {} }, [period]);

  const [stats, setStats] = useState({ calls: 0, missed: 0, sms: 0, voicemails: 0, meetings: 0, hotLeads: 0, tasks: 0, outbound: 0 });
  const [recent, setRecent] = useState<any[]>([]);
  const [hotLeads, setHotLeads] = useState<any[]>([]);
  const [dueReminders, setDueReminders] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [msMeetings, setMsMeetings] = useState<any[]>([]);
  const [msCalendarLoading, setMsCalendarLoading] = useState(false);
  const [msCalendarError, setMsCalendarError] = useState<string | null>(null);
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
    try {
    const { sinceIso, untilIso } = periodRange(period);
    const nowIso = new Date().toISOString();
    const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7);
    const profileExtension = profile?.ns_extension ?? profile?.extension;
    const scope = (includeExtension = false) => [
      profile?.id ? `user_id.eq.${profile.id}` : null,
      profile?.user_id ? `user_id.eq.${profile.user_id}` : null,
      includeExtension && profileExtension ? `extension.eq.${profileExtension}` : null,
    ].filter(Boolean).join(",");
    const applyScope = (query: any, includeExtension = false) => {
      const filter = scope(includeExtension);
      return filter ? query.or(filter) : query;
    };

    const settle = <T,>(p: PromiseLike<T>, fallback: T, ms = 4500): Promise<T> =>
      new Promise((resolve) => {
        const timer = window.setTimeout(() => resolve(fallback), ms);
        Promise.resolve(p)
          .then((v) => { window.clearTimeout(timer); resolve(v as T); })
          .catch(() => { window.clearTimeout(timer); resolve(fallback); });
      });

    const [nsCallsLive, nsSmsLive, nsVmLive, callsRes, missedRes, smsRes, vmRes, recentRes, hotRes, remRes, outboundRes, meetingsRes, hotCountRes, tasksCountRes] = await Promise.all([
      settle(supabase.functions.invoke("pp-ns-cdr", { body: { action: "list", limit: 100, offset: 0 } }), { data: null, error: null } as any),
      settle(supabase.functions.invoke("pp-ns-sms", { body: { action: "threads" } }), { data: null, error: null } as any),
      settle(supabase.functions.invoke("pp-ns-voicemail", { body: { action: "list", folder: "inbox" } }), { data: null, error: null } as any),
      settle(applyScope(supabase.from("planipret_phone_calls").select("id", { count: "exact", head: true }), true)
        .gte("started_at", sinceIso).lte("started_at", untilIso), { count: 0, data: null } as any),
      settle(applyScope(supabase.from("planipret_phone_calls").select("id", { count: "exact", head: true }), true)
        .eq("status", "missed").gte("started_at", sinceIso).lte("started_at", untilIso), { count: 0, data: null } as any),
      settle(applyScope(supabase.from("planipret_phone_messages").select("id", { count: "exact", head: true }))
        .is("read_at", null).eq("direction", "inbound"), { count: 0, data: null } as any),
      settle(applyScope(supabase.from("planipret_voicemails").select("id", { count: "exact", head: true }))
        .eq("is_read", false).eq("folder", "inbox"), { count: 0, data: null } as any),
      settle(applyScope(supabase.from("planipret_phone_calls")
        .select("id, direction, from_number, from_name, to_number, to_name, started_at, lead_score, lead_temperature, ai_summary"), true)
        .order("started_at", { ascending: false }).limit(5), { data: [] } as any),
      settle(applyScope(supabase.from("planipret_phone_calls")
        .select("id, from_number, from_name, to_number, to_name, lead_score, lead_temperature, started_at, direction"), true)
        .gte("started_at", sinceIso).gte("lead_score", 7)
        .order("lead_score", { ascending: false }).limit(5), { data: [] } as any),
      settle(applyScope(supabase.from("planipret_reminders").select("*"))
        .eq("status", "pending").lte("scheduled_at", nowIso)
        .order("scheduled_at", { ascending: true }).limit(10), { data: [] } as any),
      settle(applyScope(supabase.from("planipret_phone_messages").select("id", { count: "exact", head: true }))
        .eq("direction", "outbound").gte("created_at", sinceIso), { count: 0, data: null } as any),
      settle(supabase.from("appointments")
        .select("id, title, start_time, attendee_name, location_type, meeting_url")
        .eq("host_user_id", profile.user_id).gte("start_time", new Date().toISOString()).lte("start_time", weekEnd.toISOString())
        .order("start_time", { ascending: true }).limit(5), { data: [] } as any),
      settle(applyScope(supabase.from("planipret_phone_calls").select("id", { count: "exact", head: true }), true)
        .gte("lead_score", 7).gte("started_at", sinceIso).lte("started_at", untilIso), { count: 0, data: null } as any),
      settle(applyScope(supabase.from("planipret_reminders").select("id", { count: "exact", head: true }))
        .eq("status", "pending"), { count: 0, data: null } as any),
    ]);

    const liveCalls = Array.isArray((nsCallsLive.data as any)?.items) ? (nsCallsLive.data as any).items : [];
    const liveCallsInPeriod = liveCalls.filter((c: any) => {
      const ts = +new Date(nsCallTime(c));
      return Number.isFinite(ts) && ts >= +new Date(sinceIso) && ts <= +new Date(untilIso);
    });
    const liveRecent = liveCalls.slice(0, 5).map((c: any, i: number) => {
      const direction = nsCallDirection(c);
      return {
        id: String(pickHome(c, ["id", "cdr-id", "call-parent-cdr-id", "call_id", "call-id"]) ?? `ns-${i}`),
        direction,
        status: direction === "missed" ? "missed" : String(pickHome(c, ["status", "disposition"]) ?? ""),
        from_number: pickHome(c, ["from_number", "from", "caller_id_number", "caller-id-number", "orig_from_user", "ani"]),
        from_name: pickHome(c, ["from_name", "caller_id_name", "caller-id-name", "orig_from_name"]),
        to_number: pickHome(c, ["to_number", "to", "destination", "dialed_number", "dnis"]),
        to_name: pickHome(c, ["to_name", "callee_name", "destination_name"]),
        started_at: nsCallTime(c),
        ai_summary: null,
      };
    });
    const liveSmsThreads = Array.isArray((nsSmsLive.data as any)?.threads) ? (nsSmsLive.data as any).threads : [];
    const liveVmItems = Array.isArray((nsVmLive.data as any)?.items) ? (nsVmLive.data as any).items : [];
    const liveVmUnread = liveVmItems.filter((v: any) => !(v.is_read ?? v.read ?? false)).length;

    let microsoftEvents: any[] = [];
    setMsCalendarError(null);
    if (profile?.ms365_access_token) {
      setMsCalendarLoading(true);
      try {
        const calStart = new Date(); calStart.setDate(1); calStart.setHours(0,0,0,0);
        const calEnd = new Date(calStart); calEnd.setMonth(calEnd.getMonth() + 2);
        const { data: msData, error: msError } = await supabase.functions.invoke("ms365-actions", {
          body: { action: "list_calendar_events", payload: { start: calStart.toISOString(), end: calEnd.toISOString(), top: 200 } },
        });
        if (msError || (msData as any)?.success === false) {
          const errMsg = (msData as any)?.error ?? msError?.message ?? "Calendrier Microsoft indisponible";
          setMsCalendarError(errMsg);
          if (/token|expir|unauthor|401|invalid_grant/i.test(errMsg)) {
            const { startMs365Reconnect } = await import("@/lib/ms365E2E");
            startMs365Reconnect("Erreur d'authentification sur le calendrier");
          }
        } else {
          microsoftEvents = (msData as any)?.events ?? [];
        }
      } catch (e: any) {
        setMsCalendarError(e?.message ?? "Calendrier Microsoft indisponible");
      } finally {
        setMsCalendarLoading(false);
      }
    } else {
      setMsMeetings([]);
    }
    setMsMeetings(microsoftEvents);

    setStats({
      calls: liveCallsInPeriod.length || callsRes.count || 0,
      missed: liveCallsInPeriod.length ? liveCallsInPeriod.filter((c: any) => nsCallDirection(c) === "missed").length : (missedRes.count ?? 0),
      sms: liveSmsThreads.length ? liveSmsThreads.reduce((sum: number, th: any) => sum + nsSmsUnread(th), 0) : (smsRes.count ?? 0),
      voicemails: liveVmItems.length ? liveVmUnread : (vmRes.count ?? 0),
      meetings: (meetingsRes.data ?? []).length + microsoftEvents.length,
      hotLeads: hotCountRes.count ?? 0,
      tasks: tasksCountRes.count ?? 0,
      outbound: outboundRes.count ?? 0,
    });
    setRecent(liveRecent.length ? liveRecent : (recentRes.data ?? []));
    setHotLeads(hotRes.data ?? []);
    setDueReminders(remRes.data ?? []);
    setMeetings(meetingsRes.data ?? []);
    } catch (e) {
      console.error("[MHome] loadStats failed", e);
    } finally {
      setStatsLoading(false);
    }
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
      <header className="min-w-0">
        <p className="pp-eyebrow">{dateLabel}</p>
        <h1 className="text-[26px] leading-tight font-bold mt-0.5">
          {t("home.hello")}, <span style={{ color: "var(--pp-brand-accent)" }}>{firstName}</span>
        </h1>
        {(profile?.ns_extension || profile?.extension) && (
          <p className="text-[12px] mt-1" style={{ color: "var(--pp-text-muted)" }}>
            {t("extSync.extLabel")} {profile?.ns_extension || profile?.extension}
          </p>
        )}
      </header>






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

      {/* ===== MICROSOFT CALENDAR (month grid + agenda) ===== */}
      <MsCalendarSection
        profile={profile}
        events={msMeetings}
        loading={msCalendarLoading}
        error={msCalendarError}
        lang={lang}
      />

      {/* ===== SIP DEBUG SHORTCUT ===== */}
      <button
        type="button"
        onClick={() => navigate("/mplanipret/sip-debug")}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl active:scale-[0.99] transition"
        style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}
      >
        <span className="w-2 h-2 rounded-full" style={{ background: "#10B981" }} />
        <span className="text-[12px] font-semibold flex-1 text-left">SIP Debug — état & derniers événements</span>
        <span className="text-[10px] opacity-70">Ouvrir →</span>
      </button>





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

function MsCalendarSection({ profile, events, loading, error, lang }: {
  profile: any; events: any[]; loading: boolean; error: string | null; lang: string;
}) {
  const today = new Date(); today.setHours(0,0,0,0);
  const [cursor, setCursor] = useState(() => { const d=new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; });
  const [selected, setSelected] = useState<Date>(today);

  const locale = lang === "en" ? "en-CA" : "fr-CA";

  const eventsByDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const e of events) {
      const dt = e.start?.dateTime ? new Date(e.start.dateTime) : null;
      if (!dt) continue;
      const key = `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
      (map[key] ||= []).push(e);
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a,b) => +new Date(a.start.dateTime) - +new Date(b.start.dateTime));
    }
    return map;
  }, [events]);

  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const selectedEvents = eventsByDay[dayKey(selected)] ?? [];

  // Build 6-week grid starting from Sunday
  const gridStart = new Date(cursor);
  gridStart.setDate(1 - cursor.getDay());
  const days: Date[] = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); return d;
  });

  const weekdays = lang === "en"
    ? ["S","M","T","W","T","F","S"]
    : ["D","L","M","M","J","V","S"];

  const monthLabel = cursor.toLocaleDateString(locale, { month: "long", year: "numeric" });

  return (
    <section className="pp-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-1.5 pp-heading">
          <Calendar className="w-4 h-4" style={{ color: "var(--pp-brand-accent)" }} />
          Calendrier Microsoft
        </h2>
        <div className="flex items-center gap-2">
          <span className="pp-eyebrow">{events.length}</span>
        </div>
      </div>

      {!profile?.ms365_access_token ? (
        <p className="text-xs text-center py-4" style={{ color: "var(--pp-text-muted)" }}>
          Connectez Microsoft 365 dans « Plus » pour afficher votre calendrier ici.
        </p>
      ) : (
        <>
          {/* Month header */}
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => { const d=new Date(cursor); d.setMonth(d.getMonth()-1); setCursor(d); }}
              className="w-8 h-8 rounded-lg flex items-center justify-center active:scale-95"
              style={{ background: "rgba(46,155,220,0.10)", color: "var(--pp-brand-accent)" }}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <p className="text-sm font-semibold capitalize" style={{ color: "var(--pp-text-primary)", fontFamily: "Urbanist,sans-serif" }}>
              {monthLabel}
            </p>
            <button onClick={() => { const d=new Date(cursor); d.setMonth(d.getMonth()+1); setCursor(d); }}
              className="w-8 h-8 rounded-lg flex items-center justify-center active:scale-95"
              style={{ background: "rgba(46,155,220,0.10)", color: "var(--pp-brand-accent)" }}>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {weekdays.map((w, i) => (
              <div key={i} className="text-center text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--pp-text-muted)", fontFamily: "Urbanist,sans-serif" }}>
                {w}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((d, i) => {
              const inMonth = d.getMonth() === cursor.getMonth();
              const isToday = d.getTime() === today.getTime();
              const isSelected = d.getTime() === selected.getTime();
              const dayEvents = eventsByDay[dayKey(d)] ?? [];
              const hasEvents = dayEvents.length > 0;
              return (
                <button key={i} onClick={() => setSelected(new Date(d))}
                  className="aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 active:scale-95 relative"
                  style={{
                    background: isSelected
                      ? "var(--pp-brand-accent)"
                      : isToday ? "rgba(46,155,220,0.10)" : "transparent",
                    color: isSelected
                      ? "#fff"
                      : inMonth ? "var(--pp-text-primary)" : "var(--pp-text-muted)",
                    opacity: inMonth ? 1 : 0.35,
                    border: isToday && !isSelected ? "1px solid rgba(46,155,220,0.35)" : "none",
                  }}>
                  <span className="text-[12px] font-semibold tabular-nums leading-none">{d.getDate()}</span>
                  {hasEvents && (
                    <span className="flex gap-0.5">
                      {dayEvents.slice(0,3).map((_,j) => (
                        <span key={j} className="w-1 h-1 rounded-full"
                          style={{ background: isSelected ? "#fff" : "var(--pp-brand-accent)" }} />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Selected day agenda */}
          <div className="mt-4 pt-3" style={{ borderTop: "1px solid var(--pp-bg-border)" }}>
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-2"
              style={{ color: "var(--pp-text-muted)", fontFamily: "Urbanist,sans-serif" }}>
              {selected.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })}
            </p>

            {loading ? (
              <div className="space-y-2"><Shimmer className="h-12" /><Shimmer className="h-12" /></div>
            ) : selectedEvents.length === 0 ? (
              <p className="text-xs text-center py-3" style={{ color: "var(--pp-text-muted)" }}>
                Aucun rendez-vous ce jour-là.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {selectedEvents.map((m) => {
                  const start = m.start?.dateTime ? new Date(m.start.dateTime) : null;
                  const end = m.end?.dateTime ? new Date(m.end.dateTime) : null;
                  const join = m.onlineMeeting?.joinUrl ?? m.webLink;
                  const isTeams = !!m.onlineMeeting?.joinUrl;
                  return (
                    <li key={m.id} className="flex items-center gap-3 py-2 px-2 rounded-lg"
                      style={{ background: "rgba(46,155,220,0.06)", border: "1px solid rgba(46,155,220,0.15)" }}>
                      <div className="w-14 flex-shrink-0 text-center px-1.5 py-1 rounded-md"
                        style={{ background: "rgba(46,155,220,0.12)", color: "var(--pp-brand-accent)", fontFamily: "Urbanist,sans-serif" }}>
                        <div className="text-[11px] font-bold tabular-nums leading-none">
                          {start ? start.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : "—"}
                        </div>
                        {end && (
                          <div className="text-[9px] mt-0.5 opacity-70 tabular-nums leading-none">
                            {end.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate font-medium flex items-center gap-1.5" style={{ color: "var(--pp-text-primary)" }}>
                          {isTeams && <Video className="w-3 h-3 flex-shrink-0" style={{ color: "var(--pp-brand-accent)" }} />}
                          {m.subject ?? "Sans titre"}
                        </p>
                        {(m.location?.displayName || m.bodyPreview) && (
                          <p className="text-[11px] truncate" style={{ color: "var(--pp-text-muted)" }}>
                            {m.location?.displayName || m.bodyPreview}
                          </p>
                        )}
                      </div>
                      {join && (
                        <button onClick={() => window.open(join, "_blank", "noopener,noreferrer")}
                          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ color: "var(--pp-brand-accent)", background: "rgba(46,155,220,0.10)" }}>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}

      {error && (
        <p className="text-[11px] mt-2" style={{ color: "var(--pp-danger)" }}>{error}</p>
      )}
    </section>
  );
}

