import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useQueueAgent() {
  const { user } = useAuth();
  const [queues, setQueues] = useState<any[]>([]);
  const [stats, setStats] = useState<Record<string, any>>({});

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("pbx_queue_agent_state").select("*").eq("user_id", user.id);
    setQueues(data || []);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!queues.length) return;
    const tick = async () => {
      try {
        const { data } = await supabase.functions.invoke("fusionpbx-proxy", { body: { action: "queue-stats" } });
        if (data?.stats) setStats(data.stats);
      } catch {}
    };
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, [queues.length]);

  const togglePause = useCallback(async (queueId: string, paused: boolean) => {
    await (supabase.rpc as any)("toggle_queue_pause", { _queue_id: queueId, _paused: paused });
    try {
      await supabase.functions.invoke("fusionpbx-proxy", { body: { action: "queue-pause", queue_id: queueId, paused } });
    } catch {}
    await load();
  }, [load]);

  return { queues, stats, togglePause };
}
