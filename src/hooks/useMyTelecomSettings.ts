import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type WorkingHourDay = {
  day_of_week: number;
  is_working_day: boolean;
  start_time: string;
  end_time: string;
  break_start?: string | null;
  break_end?: string | null;
  timezone?: string;
};

export type CallHandling = {
  availability: "available" | "busy" | "dnd" | "away" | "vacation";
  after_hours_action: "voicemail" | "forward_extension" | "forward_external" | "follow_org_default";
  forward_target?: string | null;
  timezone?: string;
  sync_status?: "pending" | "synced" | "failed";
  last_synced_at?: string | null;
};

export type TelecomData = {
  extension: { extension: string; sip_domain: string; display_name?: string; organization_id: string } | null;
  working_hours: WorkingHourDay[];
  call_handling: CallHandling | null;
};

async function invoke(action: string, payload?: any) {
  const { data, error } = await supabase.functions.invoke("user-telecom-settings", {
    body: { action, payload },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export function useMyTelecomSettings() {
  const qc = useQueryClient();
  const query = useQuery<TelecomData>({
    queryKey: ["my-telecom-settings"],
    queryFn: () => invoke("get"),
  });

  const saveHours = useMutation({
    mutationFn: (days: WorkingHourDay[]) => invoke("save_hours", { days }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-telecom-settings"] }),
  });

  const saveHandling = useMutation({
    mutationFn: (handling: CallHandling) => invoke("save_handling", handling),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-telecom-settings"] }),
  });

  const resetToOrgDefault = useMutation({
    mutationFn: () => invoke("reset_to_org_default"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-telecom-settings"] }),
  });

  return { query, saveHours, saveHandling, resetToOrgDefault };
}
