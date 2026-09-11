import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PAPage, PAPageHeader } from "@/components/planipret/admin/PAPageShell";
import { PPEmptyState, PPSkeleton } from "@/components/planipret/admin/PPPrimitives";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

interface BrokerRow {
  userId: string;
  name: string;
  email: string;
  extension: string;
  maestroConnected: boolean;
  maestroLastSync: string | null;
  calls30: number;
  texts30: number;
  openTasks: number;
  overdueTasks: number;
  callsSynced: number;
  textsSynced: number;
  aiCalls: number;
  talkSeconds: number;
  lastActivity: string | null;
}

interface ActivityAgg {
  calls: number;
  texts: number;
  callsSynced: number;
  textsSynced: number;
  aiCalls: number;
  talkSeconds: number;
  lastActivity: string | null;
}

const fmtDuration = (s: number) => {
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h} h ${m % 60} min` : `${m} min`;
};


/** Tableau global par courtier : appels, textos, tâches et statut de connexion (30 jours). */
export default function PABrokerStats() {
  const { lang } = useMplanipretLang();
  const en = lang === "en";
  const L = (fr: string, e: string) => (en ? e : fr);

  const [rows, setRows] = useState<BrokerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    void (async () => {
      setLoading(true);
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const [profiles, activity, tasks] = await Promise.all([
        supabase.from("planipret_profiles")
          .select("user_id, full_name, email, extension, ns_extension, maestro_connected, maestro_last_sync_at")
          .limit(1000),
        supabase.rpc("planipret_broker_activity_stats", { _since: since }),
        supabase.rpc("planipret_broker_task_stats"),
      ]);
      if (!alive) return;

      const actBy = new Map<string, ActivityAgg>();
      for (const a of (activity.data ?? []) as any[]) {
        const k = String(a.user_id ?? "");
        if (!k) continue;
        actBy.set(k, {
          calls: Number(a.calls ?? 0),
          texts: Number(a.texts ?? 0),
          callsSynced: Number(a.calls_synced ?? 0),
          textsSynced: Number(a.texts_synced ?? 0),
          aiCalls: Number(a.ai_calls ?? 0),
          talkSeconds: Number(a.talk_seconds ?? 0),
          lastActivity: a.last_activity ?? null,
        });
      }


      const tasksBy = new Map<string, { open: number; overdue: number }>();
      for (const t of (tasks.data ?? []) as any[]) {
        const k = String(t.user_id ?? "");
        if (!k) continue;
        tasksBy.set(k, { open: Number(t.open_tasks ?? 0), overdue: Number(t.overdue_tasks ?? 0) });
      }

      const out: BrokerRow[] = ((profiles.data ?? []) as any[]).map((p) => {
        const uid = String(p.user_id ?? "");
        const t = tasksBy.get(uid) ?? { open: 0, overdue: 0 };
        const a = actBy.get(uid) ?? { calls: 0, texts: 0, callsSynced: 0, textsSynced: 0, aiCalls: 0, talkSeconds: 0, lastActivity: null };
        return {
          userId: uid,
          name: p.full_name || p.email || uid.slice(0, 8),
          email: p.email ?? "",
          extension: String(p.extension || p.ns_extension || "").trim(),
          maestroConnected: Boolean(p.maestro_connected),
          maestroLastSync: p.maestro_last_sync_at ?? null,
          calls30: a.calls,
          texts30: a.texts,
          openTasks: t.open,
          overdueTasks: t.overdue,
          callsSynced: a.callsSynced,
          textsSynced: a.textsSynced,
          aiCalls: a.aiCalls,
          talkSeconds: a.talkSeconds,
          lastActivity: a.lastActivity,
        };
      }).filter((r) => r.userId);
      out.sort((a, b) => b.calls30 - a.calls30 || a.name.localeCompare(b.name));
      setRows(out);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [reloadKey]);

  const totals = useMemo(() => {
    const calls = rows.reduce((s, r) => s + r.calls30, 0);
    const texts = rows.reduce((s, r) => s + r.texts30, 0);
    const synced = rows.reduce((s, r) => s + r.callsSynced + r.textsSynced, 0);
    return {
      calls,
      texts,
      synced,
      pending: calls + texts - synced,
      open: rows.reduce((s, r) => s + r.openTasks, 0),
      connected: rows.filter((r) => r.maestroConnected).length,
    };
  }, [rows]);

  const surface = { background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-primary)" };
  const muted = { color: "var(--pp-text-muted)" };

  return (
    <PAPage>
      <PAPageHeader
        icon={<Users className="w-5 h-5" />}
        title={L("Statistiques par courtier", "Stats by broker")}
        subtitle={L("Appels, textos, tâches et statut de connexion sur 30 jours.", "Calls, texts, tasks and connection status over 30 days.")}
        actions={
          <button onClick={() => setReloadKey((k) => k + 1)} className="min-h-[36px] px-3 rounded-lg text-xs inline-flex items-center gap-1.5" style={surface}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> {L("Actualiser", "Refresh")}
          </button>
        }
      />

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <PPSkeleton key={i} style={{ height: 56 }} />)}</div>
      ) : rows.length === 0 ? (
        <PPEmptyState icon={<Users className="w-5 h-5" />} title={L("Aucun courtier", "No broker")} />
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Kpi label={L("Courtiers connectés Maestro", "Maestro-connected brokers")} value={`${totals.connected}/${rows.length}`} style={surface} />
            <Kpi label={L("Appels (30 j)", "Calls (30 d)")} value={String(totals.calls)} style={surface} />
            <Kpi label={L("Textos (30 j)", "Texts (30 d)")} value={String(totals.texts)} style={surface} />
            <Kpi label={L("Envoyés à Maestro", "Sent to Maestro")} value={String(totals.synced)} style={surface} />
            <Kpi label={L("En attente Maestro", "Pending Maestro")} value={String(totals.pending)} style={surface} />
          </div>

          <div className="rounded-xl overflow-x-auto" style={surface}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--pp-bg-border)" }}>
                  <Th>{L("Courtier", "Broker")}</Th>
                  <Th>{L("Poste", "Ext.")}</Th>
                  <Th>{L("Connexion", "Connection")}</Th>
                  <Th>{L("Appels (30 j)", "Calls (30 d)")}</Th>
                  <Th>{L("Durée totale", "Total talk time")}</Th>
                  <Th>{L("Textos (30 j)", "Texts (30 d)")}</Th>
                  <Th>{L("Envoyé à Maestro", "Sent to Maestro")}</Th>
                  <Th>{L("Dernière activité", "Last activity")}</Th>
                  <Th>{L("Tâches ouvertes", "Open tasks")}</Th>
                  <Th>{L("En retard", "Overdue")}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.userId} style={{ borderBottom: "1px solid var(--pp-bg-border)" }}>
                    <td className="px-3 py-2">
                      <p className="font-medium">{r.name}</p>
                      <p style={muted}>{r.email}</p>
                    </td>
                    <td className="px-3 py-2">{r.extension || "—"}</td>
                    <td className="px-3 py-2">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={r.maestroConnected
                          ? { background: "#10B9811A", color: "#047857" }
                          : { background: "#B91C1C1A", color: "#B91C1C" }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: r.maestroConnected ? "#10B981" : "#B91C1C" }} />
                        {r.maestroConnected ? L("Connecté", "Connected") : L("Déconnecté", "Disconnected")}
                      </span>
                      {r.maestroLastSync && (
                        <p className="mt-0.5 text-[10px]" style={muted}>
                          {L("Sync", "Synced")} {new Date(r.maestroLastSync).toLocaleDateString(en ? "en-CA" : "fr-CA")}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 font-semibold">
                      {r.calls30}
                      {r.aiCalls > 0 && <p className="text-[10px] font-normal" style={muted}>{r.aiCalls} IA</p>}
                    </td>
                    <td className="px-3 py-2">{r.talkSeconds > 0 ? fmtDuration(r.talkSeconds) : "—"}</td>
                    <td className="px-3 py-2 font-semibold">{r.texts30}</td>
                    <td className="px-3 py-2">
                      {r.calls30 + r.texts30 === 0 ? "—" : (
                        <span
                          className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium"
                          style={r.callsSynced + r.textsSynced === r.calls30 + r.texts30
                            ? { background: "#10B9811A", color: "#047857" }
                            : { background: "#F59E0B1A", color: "#B45309" }}
                        >
                          {r.callsSynced + r.textsSynced}/{r.calls30 + r.texts30}
                        </span>
                      )}
                      <p className="mt-0.5 text-[10px]" style={muted}>
                        {L("Appels", "Calls")} {r.callsSynced}/{r.calls30} · {L("Textos", "Texts")} {r.textsSynced}/{r.texts30}
                      </p>
                    </td>
                    <td className="px-3 py-2">
                      {r.lastActivity ? new Date(r.lastActivity).toLocaleString(en ? "en-CA" : "fr-CA", { dateStyle: "short", timeStyle: "short" }) : "—"}
                    </td>
                    <td className="px-3 py-2">{r.openTasks}</td>
                    <td className="px-3 py-2" style={r.overdueTasks ? { color: "#B91C1C", fontWeight: 600 } : undefined}>
                      {r.overdueTasks || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PAPage>
  );
}

function Kpi({ label, value, style }: { label: string; value: string; style: React.CSSProperties }) {
  return (
    <div className="rounded-xl p-3" style={style}>
      <p className="text-[11px] uppercase tracking-wide" style={{ color: "var(--pp-text-muted)" }}>{label}</p>
      <p className="text-xl font-semibold mt-1">{value}</p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left font-semibold text-[11px] uppercase tracking-wide" style={{ color: "var(--pp-text-muted)" }}>
      {children}
    </th>
  );
}
