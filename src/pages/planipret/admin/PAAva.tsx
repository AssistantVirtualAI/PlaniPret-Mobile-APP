import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Sparkles, TrendingUp, ThumbsUp, ThumbsDown, Bot, Mail, Zap, CheckCircle2, XCircle } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";

const ACCENT = "#2E9BDC";
const SUCCESS = "#00D4AA";
const DANGER = "#E84C4C";
const WARNING = "#F5A623";
const AGENT = "#9B7FE8";

type Row = {
  user_id: string;
  analyses_30d: number;
  urgent_30d: number;
  leads_30d: number;
  actions_ok_30d: number;
  actions_err_30d: number;
  actions_modified_30d: number;
};

const TooltipDark = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--pp-bg-deep)", border: "1px solid var(--pp-bg-border-2)", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "var(--pp-text-primary)" }}>
      {label && <div style={{ color: "var(--pp-text-muted)", marginBottom: 4 }}>{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color || p.fill }} />
          <span>{p.name}: <strong>{p.value}</strong></span>
        </div>
      ))}
    </div>
  );
};

function KpiTile({ icon, label, value, color, sub }: { icon: any; label: string; value: string | number; color: string; sub?: string }) {
  return (
    <div className="pp-card relative overflow-hidden" style={{ padding: 16 }}>
      <div aria-hidden className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: `linear-gradient(90deg, ${color}, transparent)` }} />
      <div className="flex items-center justify-between">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${color}1A`, color, border: `1px solid ${color}33` }}>
          {icon}
        </div>
      </div>
      <div className="tabular-nums" style={{ fontSize: 26, fontWeight: 700, marginTop: 8, color: "var(--pp-text-primary)" }}>{value}</div>
      <p style={{ fontSize: 11, color: "var(--pp-text-secondary)", marginTop: 4 }}>{label}</p>
      {sub && <p style={{ fontSize: 10, color: "var(--pp-text-faint)", marginTop: 2 }}>{sub}</p>}
    </div>
  );
}

export default function PAAva() {
  const [rows, setRows] = useState<Row[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [fbStats, setFbStats] = useState({ up: 0, down: 0, modified: 0, skipped: 0 });
  const [tuning, setTuning] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [dailySeries, setDailySeries] = useState<Array<{ day: string; analyses: number; leads: number; urgent: number }>>([]);
  const [toolMix, setToolMix] = useState<Array<{ name: string; value: number; color: string }>>([]);
  const [recentActions, setRecentActions] = useState<any[]>([]);

  const load = async () => {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const [statsRes, fbRes, emailAnalyses, actionLog, toolLog] = await Promise.all([
      supabase.from("planipret_ava_stats").select("*"),
      supabase.from("planipret_ava_feedback").select("rating").gte("created_at", since),
      supabase.from("planipret_ava_email_analyses").select("created_at, is_lead, is_urgent").gte("created_at", since),
      supabase.from("planipret_ava_action_log").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(10),
      supabase.from("ai_request_audit_log").select("action").gte("created_at", since).like("action", "elevenlabs_tool:%"),
    ]);
    const list = (statsRes.data ?? []) as Row[];
    setRows(list);
    const counts = { up: 0, down: 0, modified: 0, skipped: 0 } as any;
    (fbRes.data ?? []).forEach((r: any) => { counts[r.rating] = (counts[r.rating] ?? 0) + 1; });
    setFbStats(counts);

    if (list.length) {
      const { data: p } = await supabase
        .from("planipret_profiles")
        .select("user_id, full_name")
        .in("user_id", list.map((r) => r.user_id));
      const m: Record<string, string> = {};
      (p ?? []).forEach((x: any) => { if (x.user_id) m[x.user_id] = x.full_name ?? ""; });
      setProfiles(m);
    }

    // Daily analyses series
    const days: Record<string, { analyses: number; leads: number; urgent: number }> = {};
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      days[d.toISOString().slice(0, 10)] = { analyses: 0, leads: 0, urgent: 0 };
    }
    (emailAnalyses.data ?? []).forEach((r: any) => {
      const k = r.created_at?.slice(0, 10);
      if (k && days[k]) {
        days[k].analyses++;
        if (r.is_lead) days[k].leads++;
        if (r.is_urgent) days[k].urgent++;
      }
    });
    setDailySeries(Object.entries(days).map(([k, v]) => ({
      day: new Date(k).toLocaleDateString("fr-CA", { day: "2-digit", month: "2-digit" }),
      ...v,
    })));

    // Tool call mix
    const toolMap: Record<string, number> = {};
    (toolLog.data ?? []).forEach((r: any) => {
      const tool = String(r.action).replace(/^elevenlabs_tool:/, "");
      toolMap[tool] = (toolMap[tool] ?? 0) + 1;
    });
    const palette = [ACCENT, SUCCESS, AGENT, WARNING, DANGER, "#F5C842", "#4A7FA5"];
    setToolMix(
      Object.entries(toolMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 7)
        .map(([name, value], i) => ({ name, value, color: palette[i % palette.length] })),
    );

    setRecentActions(actionLog.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("admin-ava")
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_ava_feedback" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_ava_email_analyses" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_ava_action_log" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const retune = async () => {
    setTuning(true);
    const { data, error } = await supabase.functions.invoke("ava-prompt-tuner", { body: {} });
    setTuning(false);
    if (error || !(data as any)?.success) { toast.error("Échec du réentraînement"); return; }
    toast.success(`AVA réentraînée sur ${(data as any).count} courtier(s)`);
    load();
  };
  const analyzeAll = async () => {
    setAnalyzing(true);
    const tid = toast.loading("Analyse des emails des courtiers…");
    try {
      const { data, error } = await supabase.functions.invoke("ava-analyze-all", { body: { top: 20 } });
      if (error) throw error;
      const d = data as any;
      if (!d?.ok) throw new Error(d?.error ?? "Échec");
      toast.success(`${d.total_analyses} email(s) analysé(s) sur ${d.analyzed_brokers} courtier(s)`, { id: tid });
      await load();
    } catch (e: any) {
      toast.error(`Analyse échouée: ${e.message ?? e}`, { id: tid });
    } finally {
      setAnalyzing(false);
    }
  };

  const totals = rows.reduce((acc, r) => ({
    analyses: acc.analyses + (r.analyses_30d ?? 0),
    urgent: acc.urgent + (r.urgent_30d ?? 0),
    leads: acc.leads + (r.leads_30d ?? 0),
    ok: acc.ok + (r.actions_ok_30d ?? 0),
    err: acc.err + (r.actions_err_30d ?? 0),
    modified: acc.modified + (r.actions_modified_30d ?? 0),
  }), { analyses: 0, urgent: 0, leads: 0, ok: 0, err: 0, modified: 0 });

  const approvalRate = totals.ok + totals.err > 0 ? Math.round((totals.ok / (totals.ok + totals.err)) * 100) : 0;
  const fbTotal = fbStats.up + fbStats.down + fbStats.modified + fbStats.skipped;
  const satisfaction = fbTotal > 0 ? Math.round(((fbStats.up) / fbTotal) * 100) : 0;

  const feedbackDonut = useMemo(() => [
    { name: "👍 Positif", value: fbStats.up, color: SUCCESS },
    { name: "👎 Négatif", value: fbStats.down, color: DANGER },
    { name: "✏️ Modifié", value: fbStats.modified, color: WARNING },
    { name: "↷ Ignoré", value: fbStats.skipped, color: "#6B7280" },
  ].filter((s) => s.value > 0), [fbStats]);

  const brokerLeaderboard = useMemo(() => {
    return [...rows]
      .sort((a, b) => (b.analyses_30d ?? 0) - (a.analyses_30d ?? 0))
      .slice(0, 10)
      .map((r) => ({
        name: profiles[r.user_id] || r.user_id.slice(0, 8),
        analyses: r.analyses_30d ?? 0,
        leads: r.leads_30d ?? 0,
        ok: r.actions_ok_30d ?? 0,
        err: r.actions_err_30d ?? 0,
      }));
  }, [rows, profiles]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 style={{ fontFamily: "Inter,sans-serif", fontWeight: 700, fontSize: 22, color: "var(--pp-text-primary)" }}>AVA · Analytics 30 jours</h1>
          <p style={{ fontSize: 12, color: "var(--pp-text-faint)" }} className="mt-0.5">
            Analyses d'emails, actions, feedback et apprentissage — sync automatique en temps réel.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={analyzeAll} disabled={analyzing} variant="default" size="sm">
            {analyzing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
            Analyser les emails maintenant
          </Button>
          <Button onClick={retune} disabled={tuning} variant="outline" size="sm">
            {tuning ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
            Réentraîner AVA
          </Button>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <KpiTile icon={<Mail className="w-4 h-4" />} label="Analyses" value={totals.analyses} color={ACCENT} />
        <KpiTile icon={<TrendingUp className="w-4 h-4" />} label="Leads détectés" value={totals.leads} color={SUCCESS} />
        <KpiTile icon={<Zap className="w-4 h-4" />} label="Urgent" value={totals.urgent} color={WARNING} />
        <KpiTile icon={<CheckCircle2 className="w-4 h-4" />} label="Actions exécutées" value={totals.ok} color={SUCCESS} sub={`${approvalRate}% succès`} />
        <KpiTile icon={<XCircle className="w-4 h-4" />} label="Erreurs" value={totals.err} color={DANGER} />
        <KpiTile icon={<Bot className="w-4 h-4" />} label="Courtiers actifs" value={rows.length} color={AGENT} />
        <KpiTile icon={<ThumbsUp className="w-4 h-4" />} label="Feedback 👍" value={fbStats.up} color={SUCCESS} />
        <KpiTile icon={<ThumbsDown className="w-4 h-4" />} label="Feedback 👎" value={fbStats.down} color={DANGER} />
        <KpiTile icon={<Sparkles className="w-4 h-4" />} label="Satisfaction" value={`${satisfaction}%`} color={AGENT} sub={`${fbTotal} avis`} />
        <KpiTile icon={<Sparkles className="w-4 h-4" />} label="Modifiées" value={totals.modified} color={WARNING} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="pp-card lg:col-span-2" style={{ padding: 20 }}>
          <h3 style={{ fontWeight: 600, fontSize: 14, color: "var(--pp-text-primary)", marginBottom: 12 }}>Analyses par jour · 30 j</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={dailySeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#4A7FA5" }} />
              <YAxis tick={{ fontSize: 10, fill: "#4A7FA5" }} />
              <Tooltip content={<TooltipDark />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="analyses" name="Analyses" stroke={ACCENT} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="leads" name="Leads" stroke={SUCCESS} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="urgent" name="Urgent" stroke={WARNING} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="pp-card" style={{ padding: 20 }}>
          <h3 style={{ fontWeight: 600, fontSize: 14, color: "var(--pp-text-primary)", marginBottom: 12 }}>Satisfaction courtier</h3>
          {feedbackDonut.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--pp-text-faint)", padding: "60px 0", textAlign: "center" }}>Pas encore de feedback</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={feedbackDonut} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={4}>
                  {feedbackDonut.map((e, i) => <Cell key={i} fill={e.color} stroke="var(--pp-bg-surface)" strokeWidth={2} />)}
                </Pie>
                <Tooltip content={<TooltipDark />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Broker leaderboard + tool mix */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="pp-card lg:col-span-2" style={{ padding: 20 }}>
          <h3 style={{ fontWeight: 600, fontSize: 14, color: "var(--pp-text-primary)", marginBottom: 12 }}>Top courtiers · analyses vs actions</h3>
          {brokerLeaderboard.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--pp-text-faint)", padding: "40px 0", textAlign: "center" }}>Aucune donnée AVA pour le moment.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={brokerLeaderboard} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" tick={{ fontSize: 10, fill: "#4A7FA5" }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#8FA8C0" }} width={140} />
                <Tooltip content={<TooltipDark />} cursor={{ fill: "rgba(46,155,220,0.06)" }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="analyses" name="Analyses" fill={ACCENT} radius={[0, 4, 4, 0]} />
                <Bar dataKey="ok" name="Actions ✓" fill={SUCCESS} radius={[0, 4, 4, 0]} />
                <Bar dataKey="err" name="Erreurs" fill={DANGER} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="pp-card" style={{ padding: 20 }}>
          <h3 style={{ fontWeight: 600, fontSize: 14, color: "var(--pp-text-primary)", marginBottom: 12 }}>Outils AVA appelés</h3>
          {toolMix.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--pp-text-faint)", padding: "60px 0", textAlign: "center" }}>Aucun appel d'outil récent</p>
          ) : (
            <div className="space-y-2">
              {toolMix.map((t) => {
                const max = Math.max(...toolMix.map((x) => x.value));
                const pct = Math.round((t.value / max) * 100);
                return (
                  <div key={t.name}>
                    <div className="flex items-center justify-between mb-1">
                      <span style={{ fontSize: 11, color: "var(--pp-text-secondary)" }} className="truncate">{t.name}</span>
                      <span className="tabular-nums" style={{ fontSize: 11, fontWeight: 600, color: t.color }}>{t.value}</span>
                    </div>
                    <div style={{ height: 6, background: "var(--pp-bg-elevated)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: t.color, transition: "width .3s" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent actions */}
      <div className="pp-card" style={{ padding: 20 }}>
        <h3 style={{ fontWeight: 600, fontSize: 14, color: "var(--pp-text-primary)", marginBottom: 12 }}>Actions AVA récentes</h3>
        {loading ? (
          <p style={{ fontSize: 12, color: "var(--pp-text-faint)" }}>Chargement…</p>
        ) : recentActions.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--pp-text-faint)" }}>Aucune action AVA récente.</p>
        ) : (
          <div className="space-y-1">
            {recentActions.map((a) => {
              const ok = a.status === "ok" || a.status === "success" || a.status === "executed";
              const color = ok ? SUCCESS : a.status === "error" ? DANGER : WARNING;
              return (
                <div key={a.id} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--pp-text-primary)" }} className="truncate flex-1">
                    {a.action_type ?? a.action ?? "action"}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--pp-text-muted)" }}>{profiles[a.user_id] || a.user_id?.slice(0, 8)}</span>
                  <span style={{ fontSize: 10, color: "var(--pp-text-faint)" }} className="tabular-nums">
                    {a.created_at ? new Date(a.created_at).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" }) : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
