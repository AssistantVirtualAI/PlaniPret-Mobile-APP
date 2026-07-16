import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type TeamMember = {
  user_id: string;
  organization_id: string | null;
  extension: string | null;
  status: string;
  status_message: string | null;
  status_emoji: string | null;
  call_state: string;
  platform: string | null;
  last_seen_at: string;
  display_name?: string | null;
  email?: string | null;
};

export function useTeamPresence(organizationId?: string | null) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;

    const load = async () => {
      const { data: presence } = await supabase
        .from("user_presence")
        .select("user_id, organization_id, extension, status, status_message, status_emoji, call_state, platform, last_seen_at")
        .eq("organization_id", organizationId);
      const ids = (presence || []).map((p: any) => p.user_id);
      let profiles: any[] = [];
      if (ids.length) {
        const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
        profiles = data || [];
      }
      if (cancelled) return;
      const map = new Map(profiles.map((p) => [p.id, p]));
      setMembers(
        (presence || []).map((p: any) => ({
          ...p,
          display_name: map.get(p.user_id)?.full_name,
          email: map.get(p.user_id)?.email,
        }))
      );
      setLoading(false);
    };
    load();

    const ch = supabase
      .channel(`presence-${organizationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_presence", filter: `organization_id=eq.${organizationId}` },
        () => load()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [organizationId]);

  return { members, loading };
}
