import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePlanipretTasks } from "@/hooks/planipret/usePlanipretTasks";
import ClientMaestro360 from "@/components/planipret/clients/ClientMaestro360";

interface BrokerOption { id: string; name: string; userId: string | null }

/** Vue par courtier : ses clients avec tâches, dossiers, commissions et appels. */
export default function MBroker360() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [brokers, setBrokers] = useState<BrokerOption[]>([]);
  const [broker, setBroker] = useState("");
  const lang = (localStorage.getItem("pp_lang") === "en" ? "en" : "fr") as "fr" | "en";
  const en = lang === "en";
  const L = (fr: string, e: string) => (en ? e : fr);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (alive) setUserId(data.user?.id ?? null);
      const { data: rows } = await supabase
        .from("planipret_profiles")
        .select("user_id, full_name, email, maestro_broker_id")
        .not("maestro_broker_id", "is", null)
        .order("full_name", { ascending: true });
      if (!alive) return;
      const seen = new Set<string>();
      const opts: BrokerOption[] = [];
      for (const r of (rows ?? []) as any[]) {
        const id = String(r.maestro_broker_id ?? "").trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        opts.push({ id, userId: r.user_id ?? null, name: r.full_name || r.email || `#${id}` });
      }
      setBrokers(opts);
    })();
    return () => { alive = false; };
  }, []);

  const { tasks, loading, lastSyncAt, setFilter } = usePlanipretTasks(userId, { brokerId: broker || null });
  useEffect(() => { setFilter("all"); }, [setFilter]);

  const ownerIds = useMemo(() => {
    if (!broker) return userId ? [userId] : [];
    const b = brokers.find((x) => x.id === broker);
    return b?.userId ? [b.userId] : [];
  }, [broker, brokers, userId]);

  const surface = { background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-primary)" };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} aria-label={L("Retour", "Back")}
          className="w-11 h-11 rounded-xl flex items-center justify-center" style={surface}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h1 className="text-base font-semibold pp-heading">{L("Clients par courtier", "Clients by broker")}</h1>
      </div>

      <select aria-label={L("Courtier", "Broker")} value={broker} onChange={(e) => setBroker(e.target.value)}
        className="w-full min-h-[40px] rounded-xl px-2 text-xs" style={surface}>
        <option value="">{L("Mes clients", "My clients")}</option>
        {brokers.map((b) => <option key={b.id} value={b.id}>{b.name} · #{b.id}</option>)}
      </select>

      <ClientMaestro360
        key={broker || "me"}
        tasks={tasks}
        userIds={ownerIds}
        lang={lang}
        lastSyncAt={lastSyncAt}
        loading={loading}
        onOpenClient={(k) => navigate(`/mplanipret/clients-360/${encodeURIComponent(k)}`)}
      />
    </div>
  );
}
