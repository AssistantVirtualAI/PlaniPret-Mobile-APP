import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type CallForwarding = {
  user_id: string;
  always_enabled: boolean;
  always_to: string | null;
  busy_enabled: boolean;
  busy_to: string | null;
  no_answer_enabled: boolean;
  no_answer_to: string | null;
  no_answer_seconds: number;
  offline_enabled: boolean;
  offline_to: string | null;
  dnd_enabled: boolean;
  dnd_schedule: any;
  allow_from: "all" | "team" | "whitelist";
  whitelist: string[];
};

export function useCallForwarding() {
  const { user } = useAuth();
  const [data, setData] = useState<CallForwarding | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: row } = await supabase.from("pbx_call_forwarding").select("*").eq("user_id", user.id).maybeSingle();
    setData(row as any);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(
    async (patch: Partial<CallForwarding>) => {
      if (!user) return;
      await supabase.from("pbx_call_forwarding").upsert({ user_id: user.id, ...patch, updated_at: new Date().toISOString() } as any);
      try {
        await supabase.functions.invoke("fusionpbx-proxy", { body: { action: "update-forwarding", ...patch } });
      } catch {}
      await load();
    },
    [user, load]
  );

  return { data, loading, save, reload: load };
}
