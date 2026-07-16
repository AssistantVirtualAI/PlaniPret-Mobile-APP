import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type MyDashboardStats = {
  has_extension: boolean;
  extension?: string;
  display_name?: string;
  today_calls?: number;
  unread_voicemail?: number;
  registration_status?: string;
  recordings_count: number;
  week_calls: number;
  missed_calls_today: number;
  total_talk_seconds_today: number;
  recent_calls: Array<any>;
  recent_recordings: Array<any>;
  recent_voicemails: Array<any>;
  recent_insights: Array<any>;
};

export function useMyDashboardStats() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-dashboard-stats", user?.id],
    enabled: !!user?.id,
    refetchInterval: 30_000,
    queryFn: async (): Promise<MyDashboardStats> => {
      const { data: summary, error: summaryError } = await (supabase.rpc as any)("get_my_extension_summary");
      if (summaryError) {
        console.warn("get_my_extension_summary failed", summaryError);
      }
      const s = summary ?? {};
      if (!s?.has_extension) {
        return {
          has_extension: false,
          recordings_count: 0,
          week_calls: 0,
          missed_calls_today: 0,
          total_talk_seconds_today: 0,
          recent_calls: [],
          recent_recordings: [],
          recent_voicemails: [],
          recent_insights: [],
        };
      }
      const { data: spu } = await supabase
        .from("pbx_softphone_users")
        .select("organization_id, extension")
        .eq("portal_user_id", user!.id)
        .maybeSingle();

      const orgId = spu?.organization_id;
      const ext = spu?.extension;
      if (!orgId || !ext) {
        return {
          has_extension: false,
          recordings_count: 0,
          week_calls: 0,
          missed_calls_today: 0,
          total_talk_seconds_today: 0,
          recent_calls: [],
          recent_recordings: [],
          recent_voicemails: [],
          recent_insights: [],
        };
      }
      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
      const startToday = new Date(); startToday.setHours(0, 0, 0, 0);

      const [calls7d, callsToday, recCalls, recRecordings, recVms, insights, recCount] = await Promise.all([
        supabase.from("pbx_call_records").select("id", { count: "exact", head: true })
          .eq("organization_id", orgId).eq("extension", ext).gte("start_at", weekAgo.toISOString()),
        supabase.from("pbx_call_records").select("duration_seconds, missed_call, call_status")
          .eq("organization_id", orgId).eq("extension", ext).gte("start_at", startToday.toISOString()).limit(500),
        supabase.from("pbx_call_records")
          .select("id, direction, caller_number, destination_number, start_at, duration_seconds, call_status, missed_call, sentiment, ai_summary")
          .eq("organization_id", orgId).eq("extension", ext).order("start_at", { ascending: false }).limit(10),
        supabase.from("pbx_call_records")
          .select("id, start_at, duration_seconds, direction, recording_name, transcribed, analyzed, sentiment, ai_summary")
          .eq("organization_id", orgId).eq("extension", ext).eq("has_recording", true).order("start_at", { ascending: false }).limit(8),
        supabase.from("pbx_voicemails")
          .select("id, caller_number, caller_name, received_at, duration_seconds, read_at, ai_summary")
          .eq("organization_id", orgId).eq("extension", ext).is("deleted_at", null).order("received_at", { ascending: false }).limit(8),
        supabase.from("pbx_ai_insights")
          .select("id, created_at, summary, sentiment, topics, call_record_id")
          .eq("organization_id", orgId).order("created_at", { ascending: false }).limit(6),
        supabase.from("pbx_call_records").select("id", { count: "exact", head: true })
          .eq("organization_id", orgId).eq("extension", ext).eq("has_recording", true),
      ]);

      [calls7d, callsToday, recCalls, recRecordings, recVms, insights, recCount].forEach((res: any) => {
        if (res?.error) console.warn("my-dashboard query warning", res.error);
      });

      const todayRows = callsToday.data ?? [];
      const missed_today = todayRows.filter((r: any) => r.missed_call || r.call_status === "missed").length;
      const talk_today = todayRows.reduce((acc: number, r: any) => acc + (r.duration_seconds ?? 0), 0);

      return {
        has_extension: true,
        extension: s.extension,
        display_name: s.display_name,
        today_calls: s.today_calls ?? 0,
        unread_voicemail: s.unread_voicemail ?? 0,
        registration_status: s.registration_status,
        recordings_count: recCount.count ?? 0,
        week_calls: calls7d.count ?? 0,
        missed_calls_today: missed_today,
        total_talk_seconds_today: talk_today,
        recent_calls: recCalls.data ?? [],
        recent_recordings: recRecordings.data ?? [],
        recent_voicemails: recVms.data ?? [],
        recent_insights: insights.data ?? [],
      };
    },
  });
}
