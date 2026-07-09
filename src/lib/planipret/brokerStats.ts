// Single source of truth for Planiprêt broker activation counts.
// Reads the `planipret_broker_stats` Postgres view — every page that needs
// "App Mobile active" / "Agent IA actif" / total brokers MUST call this.
//
// Subscribe to UPDATEs on `planipret_profiles` to keep the numbers in sync
// with the toggles on /admin/users in real time (no manual refresh needed).

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type BrokerStats = {
  total_courtiers: number;
  app_mobile_active: number;
  agent_ia_active: number;
  maestro_connected: number;
  ms365_connected: number;
  ns_linked: number;
};

const EMPTY: BrokerStats = {
  total_courtiers: 0,
  app_mobile_active: 0,
  agent_ia_active: 0,
  maestro_connected: 0,
  ms365_connected: 0,
  ns_linked: 0,
};

export async function fetchPlanipretBrokerStats(): Promise<BrokerStats> {
  const { data, error } = await supabase
    .from("planipret_broker_stats" as any)
    .select("*")
    .maybeSingle();
  if (error || !data) return EMPTY;
  return {
    total_courtiers: Number((data as any).total_courtiers ?? 0),
    app_mobile_active: Number((data as any).app_mobile_active ?? 0),
    agent_ia_active: Number((data as any).agent_ia_active ?? 0),
    maestro_connected: Number((data as any).maestro_connected ?? 0),
    ms365_connected: Number((data as any).ms365_connected ?? 0),
    ns_linked: Number((data as any).ns_linked ?? 0),
  };
}

/**
 * React hook — fetches the stats once and re-fetches whenever ANY broker
 * profile is updated (toggle flipped, integration linked, etc.).
 */
export function usePlanipretBrokerStats(): { stats: BrokerStats; refresh: () => Promise<void>; loading: boolean } {
  const [stats, setStats] = useState<BrokerStats>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const s = await fetchPlanipretBrokerStats();
    setStats(s);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel("planipret-broker-stats")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "planipret_profiles" },
        () => { refresh(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  return { stats, refresh, loading };
}
