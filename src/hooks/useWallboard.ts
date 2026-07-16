import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type QueueStat = {
  id: string;
  queue_name: string;
  calls_waiting: number;
  calls_answered_today: number;
  calls_abandoned_today: number;
  avg_wait_time_seconds: number;
  service_level_percent: number;
  agents_total: number;
  agents_available: number;
  agents_on_call: number;
  agents_paused: number;
  agents_offline: number;
  longest_wait_seconds: number;
};

export type CcAgent = {
  extension: string;
  display_name: string | null;
  cc_status: string;
  cc_role: string;
  cc_queues: string[] | null;
  cc_pause_reason: string | null;
  cc_logged_in_at: string | null;
  cc_calls_today: number | null;
  cc_avg_handle_time: number | null;
};

export function useWallboard(organizationId?: string | null) {
  const [queues, setQueues] = useState<QueueStat[]>([]);
  const [agents, setAgents] = useState<CcAgent[]>([]);
  const [activeCalls, setActiveCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!organizationId) return;
    const { data } = await supabase.functions.invoke("call-center-sync", {
      body: { action: "get-wallboard", organization_id: organizationId },
    });
    setQueues(data?.queues || []);
    setAgents(data?.agents || []);
    setActiveCalls(data?.activeCalls || []);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!organizationId) return;
    const ch = supabase
      .channel(`cc-wallboard-${organizationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cc_queue_stats", filter: `organization_id=eq.${organizationId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "pbx_softphone_users", filter: `organization_id=eq.${organizationId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [organizationId, load]);

  return { queues, agents, activeCalls, loading, refresh: load };
}
