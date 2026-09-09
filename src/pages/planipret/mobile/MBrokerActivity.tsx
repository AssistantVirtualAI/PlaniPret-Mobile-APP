import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CalendarClock, ChevronLeft, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import BrokerActivityDaily from "@/components/planipret/brokers/BrokerActivityDaily";
import { fetchBrokerActivity, summarizeTasks, type BrokerActivity } from "@/lib/planipret/brokerActivity";

interface BrokerOption { userId: string; name: string }

const RANGES = [7, 14, 30];

/** Suivi par courtier sur mobile : appels, textos et tâches, sans passer par le portail. */
export default function MBrokerActivity() {
  const navigate = useNavigate();
  const lang = (localStorage.getItem("pp_lang") === "en" ? "en" : "fr") as "fr" | "en";
  const en = lang === "en";
  const L = (fr: string, e: string) => (en ? e : fr);

  const [me, setMe] = useState<string | null>(null);
  const [brokers, setBrokers] = useState<BrokerOption[]>([]);
  const [selected, setSelected] = useState("");
  const [days, setDays] = useState(7);
  const [activity, setActivity] = useState<BrokerActivity>({ calls: [], messages: [], tasks: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      const uid = data.user?.id ?? null;
      setMe(uid);
      setSelected((s) => s || uid || "");
      const { data: rows } = await supabase
        .from("planipret_profiles")
        .select("user_id, full_name, email")
        .order("full_name", { ascending: true })
        .limit(1000);
      if (!alive) return;
      setBrokers(((rows ?? []) as any[])
        .filter((r) => r.user_id)
        .map((r) => ({ userId: String(r.user_id), name: r.full_name || r.email || String(r.user_id).slice(0, 8) })));
    })();
    return () => { alive = false; };
  }, []);

  const load = useCallback(async () => {
    const uid = selected || me;
    if (!uid) return;
    setLoading(true);
    const a = await fetchBrokerActivity(uid, days);
    setActivity(a);
    setLoading(false);
  }, [selected, me, days]);

  useEffect(() => { void load(); }, [load]);

  // Rafraîchissement automatique : temps réel + retour au premier plan.
  useEffect(() => {
    const uid = selected || me;
    if (!uid) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => { void load(); }, 800); };
    const ch = supabase.channel(`pp-broker-activity-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_phone_calls", filter: `user_id=eq.${uid}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_phone_messages", filter: `user_id=eq.${uid}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_tasks_projection", filter: `user_id=eq.${uid}` }, bump)
      .subscribe();
    const onFocus = () => { if (document.visibilityState === "visible") bump(); };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
      void supabase.removeChannel(ch);
    };
  }, [load, selected, me]);

  const summary = useMemo(() => summarizeTasks(activity.tasks), [activity.tasks]);
  const dueLabel = (iso: string | null) => (iso
    ? new Date(iso).toLocaleString(en ? "en-CA" : "fr-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Toronto" })
    : L("Sans échéance", "No due date"));

  const surface = { background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-primary)" };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} aria-label={L("Retour", "Back")}
          className="w-11 h-11 rounded-xl flex items-center justify-center" style={surface}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h1 className="text-base font-semibold pp-heading">{L("Suivi par courtier", "Broker tracking")}</h1>
        <button onClick={() => void load()} aria-label={L("Actualiser", "Refresh")}
          className="ml-auto w-11 h-11 rounded-xl flex items-center justify-center" style={surface}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <select aria-label={L("Courtier", "Broker")} value={selected} onChange={(e) => setSelected(e.target.value)}
        className="w-full min-h-[44px] rounded-xl px-2 text-xs" style={surface}>
        {me && <option value={me}>{L("Moi", "Me")}</option>}
        {brokers.filter((b) => b.userId !== me).map((b) => <option key={b.userId} value={b.userId}>{b.name}</option>)}
      </select>

      <div className="flex gap-2">
        {RANGES.map((d) => (
          <button key={d} onClick={() => setDays(d)}
            className="flex-1 min-h-[38px] rounded-xl text-xs font-semibold"
            style={days === d
              ? { background: "var(--pp-brand-accent)", color: "#fff", border: "1px solid var(--pp-brand-accent)" }
              : surface}>
            {d} {L("jours", "days")}
          </button>
        ))}
      </div>

      {!loading && (
        <div className="rounded-2xl p-3 space-y-2" style={surface} data-testid="broker-task-summary">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4" style={{ color: "var(--pp-brand-accent)" }} />
            <p className="text-xs font-semibold">{L("Prochaine tâche", "Next task")}</p>
            <span className="ml-auto text-[11px]" style={{ color: "var(--pp-text-muted)" }}>
              {summary.open} {L("ouvertes", "open")}
            </span>
          </div>

          {summary.overdue > 0 && (
            <p className="flex items-center gap-1.5 text-[11.5px] font-semibold rounded-xl px-2.5 py-2"
              style={{ background: "rgba(185,28,28,0.10)", color: "#B91C1C" }}>
              <AlertTriangle className="w-3.5 h-3.5" />
              {summary.overdue} {L("tâche(s) en retard", "task(s) overdue")}
            </p>
          )}

          {summary.next ? (
            <div>
              <p className="text-sm font-medium truncate">{summary.next.client}</p>
              <p className="text-[11.5px] truncate" style={{ color: "var(--pp-text-muted)" }}>{summary.next.title}</p>
              <p className="text-[11.5px] font-semibold mt-0.5"
                style={{ color: summary.next.overdue ? "#B91C1C" : "var(--pp-text-secondary, var(--pp-text-muted))" }}>
                {summary.next.overdue ? L("En retard — ", "Overdue — ") : ""}{dueLabel(summary.next.at)}
              </p>
            </div>
          ) : (
            <p className="text-[11.5px]" style={{ color: "var(--pp-text-muted)" }}>
              {L("Aucune tâche ouverte.", "No open task.")}
            </p>
          )}
        </div>
      )}

      <BrokerActivityDaily activity={activity} lang={lang} loading={loading} />
    </div>
  );
}
