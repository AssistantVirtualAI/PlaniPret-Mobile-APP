import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SetupProgress =
  | { type: "tool_added"; tool_name: string; count: number; total: number }
  | { type: "setup_complete"; agent_id: string; tools_count: number }
  | { type: "setup_error"; step: string; error: string };

export function useElevenLabsSetupProgress(userId: string | null) {
  const [events, setEvents] = useState<SetupProgress[]>([]);
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`elevenlabs-setup:${userId}`)
      .on("broadcast", { event: "progress" }, ({ payload }) => {
        setEvents((prev) => [...prev, payload as SetupProgress]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);
  return { events, reset: () => setEvents([]) };
}
