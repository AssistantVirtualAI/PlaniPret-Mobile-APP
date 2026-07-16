import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useLemtelAiRealtime(orgId?: string | null, onChange?: () => void) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!orgId) return;
    const orgFilter = orgId ? `organization_id=eq.${orgId}` : undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryAttempt = 0;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let transcriptBroadcast: ReturnType<typeof supabase.channel> | null = null;
    let insightBroadcast: ReturnType<typeof supabase.channel> | null = null;

    const refresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        qc.invalidateQueries({ queryKey: ["pbx"] });
        qc.invalidateQueries({ queryKey: ["media"] });
        qc.invalidateQueries({ queryKey: ["media", "recordings"] });
        qc.invalidateQueries({ queryKey: ["media", "cdr"] });
        qc.invalidateQueries({ queryKey: ["my-dashboard-stats"] });
        qc.invalidateQueries({ queryKey: ["pbx_ai_insights"] });
        qc.invalidateQueries({ queryKey: ["pbx_call_transcripts"] });
        qc.invalidateQueries({ queryKey: ["admin-dashboard-tiles"] });
        qc.invalidateQueries({ queryKey: ["call-intel"] });
        onChange?.();
      }, 500);
    };

    const connect = () => {
      channel = supabase.channel(`lemtel-ai-rt-${orgId || "all"}-${Date.now()}`);
      channel
        .on("postgres_changes", { event: "*", schema: "public", table: "pbx_call_transcripts", ...(orgFilter ? { filter: orgFilter } : {}) }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "pbx_ai_insights", ...(orgFilter ? { filter: orgFilter } : {}) }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "pbx_call_records", ...(orgFilter ? { filter: orgFilter } : {}) }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "pbx_call_recordings", ...(orgFilter ? { filter: orgFilter } : {}) }, refresh)
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            retryAttempt = 0;
            return;
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            if (retryTimer) return;
            const delay = Math.min(60_000, 2_000 * 2 ** retryAttempt++);
            retryTimer = setTimeout(() => {
              retryTimer = null;
              if (channel) supabase.removeChannel(channel);
              connect();
            }, delay);
          }
        });
    };

    connect();
    transcriptBroadcast = supabase.channel(`ai-transcripts:${orgId}`).on("broadcast", { event: "transcript" }, refresh).subscribe();
    insightBroadcast = supabase.channel(`ai-insights:${orgId}`).on("broadcast", { event: "insights" }, refresh).subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      if (retryTimer) clearTimeout(retryTimer);
      if (channel) supabase.removeChannel(channel);
      if (transcriptBroadcast) supabase.removeChannel(transcriptBroadcast);
      if (insightBroadcast) supabase.removeChannel(insightBroadcast);
    };
  }, [orgId, qc, onChange]);
}