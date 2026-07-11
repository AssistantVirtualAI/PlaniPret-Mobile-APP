/**
 * Microsoft 365 stats card — used inside MStats.
 * Fetches ms365-stats and renders KPI + daily bar chart + upcoming meetings + AVA insights.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Mail, Calendar, Send, Inbox, Sparkles, Video, ExternalLink, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

type Payload = {
  connected?: boolean;
  days?: number;
  totals?: { emails_received: number; emails_sent: number; emails_unread: number; meetings: number; meeting_minutes: number };
  daily?: Array<{ date: string; emails_received: number; emails_sent: number; meetings: number }>;
  topSenders?: Array<{ name: string; count: number }>;
  upcomingMeetings?: Array<{ subject: string; start: string; end: string; attendees: number; is_online: boolean; join_url: string | null }>;
  insights?: string[];
};

export default function Ms365StatsCard({ days }: { days: number }) {
  const nav = useNavigate();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr(null);
    supabase.functions.invoke("ms365-stats", { body: { days, insights: true } })
      .then(({ data: res, error }) => {
        if (!alive) return;
        if (error) { setErr(error.message); setLoading(false); return; }
        setData(res as Payload); setLoading(false);
      });
    return () => { alive = false; };
  }, [days]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-4 mb-4 shadow-sm flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Chargement des données Microsoft 365…
      </div>
    );
  }
  if (err || !data) {
    return (
      <div className="bg-white rounded-2xl p-4 mb-4 shadow-sm text-sm text-red-600">
        Erreur Microsoft 365: {err ?? "inconnue"}
      </div>
    );
  }
  if (data.connected === false) {
    return (
      <div className="bg-white rounded-2xl p-4 mb-4 shadow-sm">
        <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-slate-700">
          <Mail className="w-4 h-4 text-blue-500" /> Microsoft 365 non connecté
        </div>
        <p className="text-xs text-slate-500 mb-3">Connectez votre compte pour voir emails et réunions.</p>
        <button onClick={() => nav("/mplanipret/ms365-diagnostics")} className="px-3 py-2 rounded-lg text-xs font-semibold text-white" style={{ background: "#0078D4" }}>
          Connecter Microsoft
        </button>
      </div>
    );
  }

  const t = data.totals!;
  const daily = data.daily ?? [];

  return (
    <div className="mb-4">
      <div className="flex items-center gap-1.5 mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
        <Mail className="w-3.5 h-3.5 text-blue-500" /> Microsoft 365 · {data.days}j
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <Kpi label="Emails reçus" value={t.emails_received} icon={<Inbox className="w-4 h-4 text-blue-500" />} sub={`${t.emails_unread} non lus`} />
        <Kpi label="Emails envoyés" value={t.emails_sent} icon={<Send className="w-4 h-4 text-emerald-500" />} />
        <Kpi label="Réunions" value={t.meetings} icon={<Calendar className="w-4 h-4 text-purple-500" />} sub={`${Math.round(t.meeting_minutes / 60)}h totales`} />
        <Kpi label="Moy./jour" value={(t.emails_received / Math.max(1, data.days!)).toFixed(1)} icon={<Mail className="w-4 h-4 text-orange-500" />} sub="emails reçus" />
      </div>

      <div className="bg-white rounded-2xl p-3 mb-3 shadow-sm">
        <div className="text-xs font-semibold text-slate-500 mb-2">Emails par jour</div>
        <div style={{ width: "100%", height: 180 }}>
          <ResponsiveContainer>
            <BarChart data={daily}>
              <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="emails_received" name="Reçus" fill="#3B82F6" />
              <Bar dataKey="emails_sent" name="Envoyés" fill="#10B981" />
              <Bar dataKey="meetings" name="Réunions" fill="#8B5CF6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {(data.upcomingMeetings?.length ?? 0) > 0 && (
        <div className="bg-white rounded-2xl p-3 mb-3 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" /> Prochaines réunions
          </div>
          <ul className="space-y-2">
            {data.upcomingMeetings!.slice(0, 5).map((m, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-800 truncate">{m.subject}</div>
                  <div className="text-slate-500">{new Date(m.start).toLocaleString("fr-CA", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · {m.attendees} participant(s)</div>
                </div>
                {m.is_online && m.join_url && (
                  <a href={m.join_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold" style={{ background: "#EEF2FF", color: "#4F46E5" }}>
                    <Video className="w-3 h-3" /> Rejoindre <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(data.topSenders?.length ?? 0) > 0 && (
        <div className="bg-white rounded-2xl p-3 mb-3 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 mb-2">Top expéditeurs</div>
          <ul className="space-y-1">
            {data.topSenders!.map((s, i) => (
              <li key={i} className="flex justify-between text-xs">
                <span className="text-slate-700 truncate">{s.name}</span>
                <span className="font-semibold text-slate-500">{s.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(data.insights?.length ?? 0) > 0 && (
        <div className="rounded-2xl p-3 mb-3 shadow-sm" style={{ background: "linear-gradient(135deg,#F5F3FF,#EEF2FF)", border: "1px solid #E0E7FF" }}>
          <div className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: "#6D28D9" }}>
            <Sparkles className="w-3.5 h-3.5" /> Insights AVA
          </div>
          <ul className="space-y-1.5">
            {data.insights!.map((s, i) => (
              <li key={i} className="text-xs text-slate-700">• {s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, icon, sub }: { label: string; value: any; icon: any; sub?: string }) {
  return (
    <div className="bg-white rounded-xl p-3 shadow-sm">
      <div className="text-[10px] text-slate-500 flex items-center gap-1">{icon} {label}</div>
      <div className="text-xl font-bold mt-0.5 text-slate-800">{value}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}
