// Realtime listener that surfaces Maestro pipeline events as toasts.
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useMaestroPipelineToasts(userId: string | undefined | null) {
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`ai-insights:${userId}`)
      .on("broadcast", { event: "pipeline_step" }, ({ payload }: any) => {
        if (payload?.label) toast.success(payload.label, { duration: 3500 });
      })
      .on("broadcast", { event: "pipeline_complete" }, ({ payload }: any) => {
        const temp = payload?.lead_temperature;
        const tempIcon = temp === "hot" ? "🔥" : temp === "warm" ? "🌡️" : temp === "cold" ? "❄️" : "•";
        const score = payload?.coaching_score != null ? `${payload.coaching_score}/10` : "—";
        const lead = payload?.lead_score != null ? `${payload.lead_score}/10` : "—";
        toast.success(`🤖 Analyse IA terminée — Coaching ${score} · ${tempIcon} Lead ${lead}`, {
          description: payload?.tasks_created ? `⚡ ${payload.tasks_created} tâche(s) Maestro créée(s)` : undefined,
          duration: 8000,
        });
      })
      .on("broadcast", { event: "pipeline_error" }, ({ payload }: any) => {
        toast.error(`⚠️ Erreur pipeline (${payload?.step ?? "?"})`, {
          description: payload?.error ?? "Erreur inconnue",
          duration: 7000,
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId]);
}
