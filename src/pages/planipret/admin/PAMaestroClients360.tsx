import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PAPage, PAPageHeader } from "@/components/planipret/admin/PAPageShell";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import { usePlanipretTasks } from "@/hooks/planipret/usePlanipretTasks";
import ClientMaestro360 from "@/components/planipret/clients/ClientMaestro360";
import paBanner from "@/assets/planipret/banner-clients.jpg";

interface BrokerOption { id: string; name: string; userId: string | null }

/**
 * Vue admin par client Maestro : tâches (même format que la page Tâches
 * Maestro), contacts/dossiers et commissions, filtrables par courtier.
 */
export default function PAMaestroClients360() {
  const { lang } = useMplanipretLang();
  const en = lang === "en";
  const L = (fr: string, e: string) => (en ? e : fr);

  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [brokers, setBrokers] = useState<BrokerOption[]>([]);
  const [broker, setBroker] = useState("");

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
        opts.push({
          id,
          userId: r.user_id ?? null,
          name: r.full_name || r.email || `#${id}`,
        });
      }
      setBrokers(opts);
    })();
    return () => { alive = false; };
  }, []);

  const { tasks, loading, lastSyncAt, refreshing, refresh, setFilter } = usePlanipretTasks(userId, {
    brokerId: broker || null,
  });
  useEffect(() => { setFilter("all"); }, [setFilter]);

  const ownerIds = useMemo(() => {
    if (!broker) return userId ? [userId] : [];
    if (broker === "all") return brokers.map((b) => b.userId).filter(Boolean) as string[];
    const b = brokers.find((x) => x.id === broker);
    return b?.userId ? [b.userId] : [];
  }, [broker, brokers, userId]);

  const surface = { background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-primary)" };

  return (
    <PAPage>
      <PAPageHeader
        image={paBanner}
        accent="#3B82F6"
        icon={<Users className="w-5 h-5" />}
        title={L("Clients Maestro", "Maestro clients")}
        subtitle={L(
          "Suivi par client : tâches, contacts et dossiers, dans le même format que la page Tâches Maestro.",
          "Per-client tracking: tasks, contacts and files, in the same format as the Maestro tasks page.",
        )}
        actions={
          <div className="flex items-center gap-2">
            <select aria-label={L("Courtier", "Broker")} value={broker} onChange={(e) => setBroker(e.target.value)}
              className="min-h-[36px] rounded-lg px-2 text-xs" style={surface}>
              <option value="">{L("Mes clients", "My clients")}</option>
              <option value="all">{L("Tous les courtiers", "All brokers")}</option>
              {brokers.map((b) => <option key={b.id} value={b.id}>{b.name} · #{b.id}</option>)}
            </select>
            <button onClick={() => void refresh()} className="min-h-[36px] px-3 rounded-lg text-xs inline-flex items-center gap-1.5" style={surface}>
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              {L("Actualiser", "Refresh")}
            </button>
          </div>
        }
      />

      <ClientMaestro360
        key={broker || "me"}
        tasks={tasks}
        userIds={ownerIds}
        lang={en ? "en" : "fr"}
        lastSyncAt={lastSyncAt}
        loading={loading}
        onOpenClient={(client) => navigate(`/planipret/admin/maestro-clients/${encodeURIComponent(typeof client === "string" ? client : client.key)}${broker ? `?broker=${broker}` : ""}`)}
      />
    </PAPage>
  );
}
