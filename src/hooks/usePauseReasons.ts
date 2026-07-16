import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PauseReason = { id: string; reason: string; is_productive: boolean; color: string };

export function usePauseReasons(organizationId?: string | null) {
  const [reasons, setReasons] = useState<PauseReason[]>([]);
  useEffect(() => {
    if (!organizationId) return;
    supabase.from("cc_pause_reasons").select("*").eq("organization_id", organizationId).then(({ data }) => {
      setReasons((data as any) || []);
    });
  }, [organizationId]);
  return reasons;
}
